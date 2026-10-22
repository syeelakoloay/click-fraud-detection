"use strict";

const Event = require("../models/Event");
const { parseCsv } = require("../utils/csvParser");
const {
  createImportValidationError,
  validateDatasetSemantics,
  validateIntegerFields,
} = require("../utils/datasetImportValidation");

// The canonical source dataset contains these 21 columns. Keep this contract
// aligned with dataset/click_fraud_dataset.csv and the existing Event schema.
const DATASET_HEADERS = Object.freeze([
  "click_id",
  "timestamp",
  "user_id",
  "ip_address",
  "device_type",
  "browser",
  "operating_system",
  "referrer_url",
  "page_url",
  "click_duration",
  "scroll_depth",
  "mouse_movement",
  "keystrokes_detected",
  "ad_position",
  "click_frequency",
  "time_since_last_click",
  "device_ip_reputation",
  "VPN_usage",
  "proxy_usage",
  "bot_likelihood_score",
  "is_fraudulent",
]);

const MAX_IMPORT_ROWS = 5000;
const IMPORT_CONCURRENCY = 50;
const DATASET_HEADER_SET = new Set(DATASET_HEADERS);
const EVENT_SCHEMA_FIELDS = Object.keys(Event.schema.paths).filter(
  (field) => !["_id", "__v"].includes(field)
);

const createRequestError = createImportValidationError;

function assertSchemaMatchesDataset() {
  const schemaFieldSet = new Set(EVENT_SCHEMA_FIELDS);
  const schemaMatches =
    EVENT_SCHEMA_FIELDS.length === DATASET_HEADERS.length &&
    DATASET_HEADERS.every((field) => schemaFieldSet.has(field));

  if (!schemaMatches) {
    const error = new Error(
      "Kontrak kolom dataset tidak sesuai dengan schema Event yang sedang digunakan."
    );
    error.status = 500;
    error.importCode = "IMPORT_SCHEMA_MISMATCH";
    throw error;
  }
}

function validateHeaders(headerRow) {
  const headers = headerRow.map((value) => value.trim());
  const duplicateHeaders = headers.filter(
    (header, index) => headers.indexOf(header) !== index
  );

  if (duplicateHeaders.length > 0) {
    throw createRequestError(
      `Header CSV duplikat: ${[...new Set(duplicateHeaders)].join(", ")}.`,
      400,
      "DUPLICATE_CSV_HEADER"
    );
  }

  const missingHeaders = DATASET_HEADERS.filter((header) => !headers.includes(header));
  const unknownHeaders = headers.filter((header) => !DATASET_HEADER_SET.has(header));

  if (
    headers.length !== DATASET_HEADERS.length ||
    missingHeaders.length > 0 ||
    unknownHeaders.length > 0
  ) {
    const details = [];
    if (missingHeaders.length > 0) {
      details.push(`kolom wajib yang hilang: ${missingHeaders.join(", ")}`);
    }
    if (unknownHeaders.length > 0) {
      details.push(`kolom tidak dikenal: ${unknownHeaders.join(", ")}`);
    }
    if (details.length === 0) {
      details.push(`jumlah kolom harus ${DATASET_HEADERS.length}`);
    }
    throw createRequestError(
      `Header CSV tidak sesuai dataset sumber (${details.join("; ")}).`,
      400,
      "INVALID_CSV_HEADER"
    );
  }

  return headers;
}

function getErrorMessage(error) {
  if (error && error.code === 11000) return "click_id sudah terdaftar.";
  if (error && error.name === "ValidationError") {
    return (
      Object.values(error.errors || {})
        .map((item) => item.message)
        .join("; ") || "Data event tidak valid."
    );
  }
  if (error && error.importCode) return error.message;
  return error && error.message ? error.message : "Baris CSV tidak dapat diproses.";
}

function getRowErrorCode(error) {
  if (error && error.code === 11000) return "DUPLICATE_CLICK_ID";
  if (error && error.importCode) return error.importCode;
  if (error && ["ValidationError", "CastError", "TypeError", "RangeError"].includes(error.name)) {
    return "INVALID_EVENT";
  }
  return "IMPORT_ROW_REJECTED";
}

function rejectedRow(index, rowNumber, clickId, error) {
  return {
    index,
    rowNumber,
    ...(clickId ? { click_id: clickId } : {}),
    status: "rejected",
    error: {
      code: getRowErrorCode(error),
      message: getErrorMessage(error),
    },
  };
}

async function validateRow(cells, headers, index) {
  const rowNumber = index + 2; // record 1 is the CSV header
  let payload;

  if (cells.length !== headers.length) {
    return {
      index,
      rowNumber,
      result: rejectedRow(
        index,
        rowNumber,
        undefined,
        createRequestError(
          `Jumlah field pada record ${rowNumber} adalah ${cells.length}; seharusnya ${headers.length}.`,
          400,
          "CSV_ROW_WIDTH_MISMATCH"
        )
      ),
    };
  }

  payload = Object.fromEntries(
    headers.map((header, cellIndex) => [header, cells[cellIndex]])
  );
  const clickId = String(payload.click_id ?? "").trim();

  try {
    validateDatasetSemantics(payload);
    const candidate = new Event(payload);
    await candidate.validate();

    const validatedPayload = Object.fromEntries(
      DATASET_HEADERS.map((field) => [field, candidate.get(field)])
    );

    validateIntegerFields(validatedPayload);

    return { index, rowNumber, clickId: validatedPayload.click_id, payload: validatedPayload };
  } catch (error) {
    const isRecordValidationError = Boolean(
      error &&
      (error.importCode || ["ValidationError", "CastError", "TypeError", "RangeError"].includes(error.name))
    );
    if (!isRecordValidationError) throw error;

    return {
      index,
      rowNumber,
      result: rejectedRow(index, rowNumber, clickId, error),
    };
  }
}

function createPersistenceError(cause) {
  const error = new Error(
    "Penyimpanan dataset terganggu. Sebagian record pada kelompok pemrosesan terakhir mungkin sudah tersimpan; periksa database sebelum mengulangi import."
  );
  error.status = 503;
  error.importCode = "IMPORT_PERSISTENCE_FAILED";
  error.cause = cause;
  return error;
}

function isRecordSpecificPersistenceError(error) {
  // These errors identify a specific record, not an unavailable database.
  return Boolean(
    error &&
    (error.code === 11000 || ["ValidationError", "CastError"].includes(error.name))
  );
}

async function persistValidatedRow(row, eventService) {
  try {
    await eventService.createEvent(row.payload);
    // Do not echo the complete event object for each success. The row number,
    // click_id, and status are sufficient for import reporting and keep the
    // response much smaller for 5,000-row files.
    return {
      index: row.index,
      rowNumber: row.rowNumber,
      click_id: row.clickId,
      status: "created",
    };
  } catch (error) {
    if (isRecordSpecificPersistenceError(error)) {
      return rejectedRow(row.index, row.rowNumber, row.clickId, error);
    }
    return { index: row.index, rowNumber: row.rowNumber, fatalError: error };
  }
}

function createDatasetImportController(eventService) {
  async function importDataset(req, res, next) {
    try {
      if (!Buffer.isBuffer(req.body)) {
        throw createRequestError(
          "Kirim isi file CSV sebagai body mentah dengan Content-Type text/csv atau application/csv.",
          400,
          "INVALID_CONTENT_TYPE"
        );
      }
      if (req.body.length === 0) {
        throw createRequestError("File CSV kosong.", 400, "EMPTY_CSV");
      }

      assertSchemaMatchesDataset();

      const records = parseCsv(req.body.toString("utf8"));
      if (records.length < 2) {
        throw createRequestError(
          "CSV harus berisi header dan minimal satu record data.",
          400,
          "EMPTY_CSV_DATA"
        );
      }

      const headers = validateHeaders(records[0]);
      const dataRows = records.slice(1);

      if (dataRows.length > MAX_IMPORT_ROWS) {
        throw createRequestError(
          `Jumlah record CSV tidak boleh melebihi ${MAX_IMPORT_ROWS}.`,
          400,
          "IMPORT_ROW_LIMIT_EXCEEDED"
        );
      }

      const results = [];
      for (let offset = 0; offset < dataRows.length; offset += IMPORT_CONCURRENCY) {
        const chunk = dataRows.slice(offset, offset + IMPORT_CONCURRENCY);
        const validatedRows = await Promise.all(
          chunk.map((cells, chunkIndex) => validateRow(cells, headers, offset + chunkIndex))
        );
        const rowsToPersist = validatedRows.filter((row) => row.payload);
        const persistenceResults = await Promise.all(
          rowsToPersist.map((row) => persistValidatedRow(row, eventService))
        );

        const fatalResult = persistenceResults.find((result) => result.fatalError);
        if (fatalResult) {
          // Wait for every write in this group to settle before returning an
          // infrastructure error. Do not misreport this as ordinary row validation.
          return next(createPersistenceError(fatalResult.fatalError));
        }

        const persistenceByIndex = new Map(
          persistenceResults.map((result) => [result.index, result])
        );
        results.push(
          ...validatedRows.map((row) => {
            const result = row.result || persistenceByIndex.get(row.index);
            const { index: _internalIndex, ...publicResult } = result;
            return publicResult;
          })
        );
      }

      const successCount = results.filter((item) => item.status === "created").length;
      return res.status(200).json({
        receivedCount: dataRows.length,
        successCount,
        failureCount: dataRows.length - successCount,
        results,
      });
    } catch (error) {
      return next(error);
    }
  }

  return importDataset;
}

module.exports = createDatasetImportController;
