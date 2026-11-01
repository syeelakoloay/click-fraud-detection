"use strict";

function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;

  let status = Number.isInteger(error.status) ? error.status : 500;
  let code =
    typeof error.code === "string" && error.code !== "11000"
      ? error.code
      : "INTERNAL_SERVER_ERROR";
  let safeMessage;

  if (error.importCode) {
    code = error.importCode;
    safeMessage =
      status >= 500
        ? "Terjadi kesalahan saat memproses dataset."
        : error.message || "Permintaan import tidak valid.";
  } else if (error.code === 11000) {
    status = 409;
    code = "DUPLICATE_CLICK_ID";
    safeMessage = "click_id sudah terdaftar.";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    safeMessage = "Body bukan JSON yang valid.";
  } else if (error.type === "entity.too.large" || status === 413) {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    safeMessage = "Ukuran payload melebihi batas yang diizinkan.";
  } else if (status === 403) {
    code = "CORS_ORIGIN_NOT_ALLOWED";
    safeMessage = "Origin tidak diizinkan oleh kebijakan CORS.";
  } else if (status === 404) {
    code = "NOT_FOUND";
    safeMessage = error.message || "Endpoint tidak ditemukan.";
  } else if (
    status === 400 ||
    ["ValidationError", "CastError", "TypeError", "RangeError"].includes(error.name)
  ) {
    if (!error.status) status = 400;
    if (!error.code || typeof error.code !== "string") {
      code = "VALIDATION_ERROR";
    }
    safeMessage = error.message || "Permintaan tidak valid.";
  }

  if (!Number.isInteger(status) || status < 400 || status > 599) {
    status = 500;
  }

  if (status >= 500) {
    safeMessage =
      "Terjadi kesalahan pada server. Periksa log server untuk detailnya.";
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: status >= 500 ? "error" : "warn",
    method: req.method,
    path: req.originalUrl.split("?")[0],
    statusCode: status,
    code,
    message: error.message,
    ...(status >= 500 && error.stack ? { stack: error.stack } : {}),
  };

  console[status >= 500 ? "error" : "warn"](JSON.stringify(logEntry));

  const responseMessage =
    safeMessage ||
    (status >= 500
      ? "Terjadi kesalahan pada server."
      : "Permintaan tidak dapat diproses.");

  res.status(status).json({
    error: {
      code,
      message: responseMessage,
    },
  });
}

module.exports = { errorHandler };
