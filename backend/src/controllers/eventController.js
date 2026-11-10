"use strict";

const Event = require("../models/Event");

const EVENT_FIELDS = new Set(
  Object.keys(Event.schema.paths).filter((field) => !["_id", "__v"].includes(field))
);
const MAX_INGESTION_BATCH_SIZE = 5000;
const INGESTION_CONCURRENCY = 50;

function isObjectPayload(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObjectPayload(payload, label = "body") {
  if (!isObjectPayload(payload)) {
    const error = new TypeError(`${label} harus berupa object JSON.`);
    error.status = 400;
    throw error;
  }
}

function assertKnownFields(payload, { allowClickId = true } = {}) {
  const unknownFields = Object.keys(payload).filter((field) => !EVENT_FIELDS.has(field));
  if (unknownFields.length) {
    const error = new TypeError(`Field tidak dikenal: ${unknownFields.join(", ")}.`);
    error.status = 400;
    throw error;
  }
  if (!allowClickId && Object.prototype.hasOwnProperty.call(payload, "click_id")) {
    const error = new TypeError("click_id tidak dapat diubah setelah event dibuat.");
    error.status = 400;
    throw error;
  }
}

function getErrorMessage(error) {
  if (error && error.code === 11000) return "click_id sudah terdaftar.";
  if (error && error.name === "ValidationError") {
    return Object.values(error.errors || {})
      .map((item) => item.message)
      .join("; ") || "Data event tidak valid.";
  }
  return error && error.message ? error.message : "Permintaan tidak dapat diproses.";
}

function createEventController(eventService) {
  async function createEvent(req, res, next) {
    try {
      assertObjectPayload(req.body);
      assertKnownFields(req.body);
      const event = await eventService.createEvent(req.body);
      return res.status(201).json({ data: event });
    } catch (error) {
      return next(error);
    }
  }

  async function listEvents(req, res, next) {
    try {
      const result = await eventService.listEvents(req.query);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  async function getEventByClickId(req, res, next) {
    try {
      const event = await eventService.getEventByClickId(req.params.clickId);
      if (!event) {
        return res.status(404).json({
          error: { code: "EVENT_NOT_FOUND", message: "Event tidak ditemukan." },
        });
      }
      return res.status(200).json({ data: event });
    } catch (error) {
      return next(error);
    }
  }

  async function updateEvent(req, res, next) {
    try {
      assertObjectPayload(req.body);
      assertKnownFields(req.body, { allowClickId: false });
      if (Object.keys(req.body).length === 0) {
        const error = new TypeError("Body PATCH tidak boleh kosong.");
        error.status = 400;
        throw error;
      }

      const event = await eventService.updateEventByClickId(req.params.clickId, req.body);
      if (!event) {
        return res.status(404).json({
          error: { code: "EVENT_NOT_FOUND", message: "Event tidak ditemukan." },
        });
      }
      return res.status(200).json({ data: event });
    } catch (error) {
      return next(error);
    }
  }

  async function deleteEvent(req, res, next) {
    try {
      const event = await eventService.deleteEventByClickId(req.params.clickId);
      if (!event) {
        return res.status(404).json({
          error: { code: "EVENT_NOT_FOUND", message: "Event tidak ditemukan." },
        });
      }
      return res.status(200).json({ message: "Event berhasil dihapus.", data: event });
    } catch (error) {
      return next(error);
    }
  }

  async function ingestEvents(req, res, next) {
    try {
      assertObjectPayload(req.body, "body ingestion");
      const { events } = req.body;
      if (!Array.isArray(events) || events.length === 0) {
        const error = new TypeError("events harus berupa array JSON yang tidak kosong.");
        error.status = 400;
        throw error;
      }
      if (events.length > MAX_INGESTION_BATCH_SIZE) {
        const error = new RangeError(
          `Jumlah event per batch tidak boleh melebihi ${MAX_INGESTION_BATCH_SIZE}.`
        );
        error.status = 413;
        throw error;
      }

      const results = [];
      for (let offset = 0; offset < events.length; offset += INGESTION_CONCURRENCY) {
        const chunk = events.slice(offset, offset + INGESTION_CONCURRENCY);
        const chunkResults = await Promise.all(
          chunk.map(async (eventData, chunkIndex) => {
            const index = offset + chunkIndex;
            try {
              assertObjectPayload(eventData, `events[${index}]`);
              assertKnownFields(eventData);
              const data = await eventService.createEvent(eventData);
              return { index, click_id: eventData.click_id, status: "created", data };
            } catch (error) {
              return {
                index,
                click_id: isObjectPayload(eventData) ? eventData.click_id : undefined,
                status: "rejected",
                error: {
                  code: error.code === 11000 ? "DUPLICATE_CLICK_ID" : (error.name || "INVALID_EVENT"),
                  message: getErrorMessage(error),
                },
              };
            }
          })
        );
        results.push(...chunkResults);
      }

      const successCount = results.filter((item) => item.status === "created").length;
      return res.status(200).json({
        receivedCount: events.length,
        successCount,
        failureCount: events.length - successCount,
        results,
      });
    } catch (error) {
      return next(error);
    }
  }

  return {
    createEvent,
    listEvents,
    getEventByClickId,
    updateEvent,
    deleteEvent,
    ingestEvents,
  };
}

module.exports = createEventController;
