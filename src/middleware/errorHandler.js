"use strict";

function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;

  let status = Number.isInteger(error.status) ? error.status : 500;
  let code = "INTERNAL_SERVER_ERROR";

  let safeMessage;
  if (error.code === 11000) {
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
  } else if (error.name === "ValidationError" || error.name === "CastError" || error.name === "TypeError" || error.name === "RangeError") {
    if (!error.status) status = 400;
    code = "VALIDATION_ERROR";
    safeMessage = error.message || "Permintaan tidak valid.";
  }

  const message = safeMessage || (status >= 500
    ? "Terjadi kesalahan pada server. Periksa log server untuk detailnya."
    : error.message || "Permintaan tidak valid.");

  res.status(status).json({ error: { code, message } });
}

module.exports = { errorHandler };
