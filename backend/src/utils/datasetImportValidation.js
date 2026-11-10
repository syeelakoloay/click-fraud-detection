"use strict";

const { isIP } = require("node:net");

const INTEGER_FIELDS = Object.freeze([
  "scroll_depth",
  "mouse_movement",
  "keystrokes_detected",
  "click_frequency",
  "time_since_last_click",
  "VPN_usage",
  "proxy_usage",
  "is_fraudulent",
]);

function createImportValidationError(message, status = 400, importCode = "INVALID_IMPORT") {
  const error = new TypeError(message);
  error.status = status;
  error.importCode = importCode;
  return error;
}

function isValidDatasetTimestamp(value) {
  // The source dataset uses YYYY-MM-DD HH:mm:ss. Validate the calendar date
  // explicitly because Date/Mongoose casting alone can accept ambiguous input.
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(
    String(value ?? "").trim()
  );
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = "0"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fractionText.padEnd(3, "0"));

  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function isValidHttpUrl(value) {
  const text = String(value ?? "").trim();
  if (!text || /\s/.test(text)) return false;

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch (_) {
    return false;
  }
}

function validateDatasetSemantics(payload) {
  if (!isValidDatasetTimestamp(payload.timestamp)) {
    throw createImportValidationError(
      'timestamp harus berupa tanggal yang valid dengan format "YYYY-MM-DD HH:mm:ss".',
      400,
      "INVALID_TIMESTAMP"
    );
  }

  if (isIP(String(payload.ip_address ?? "").trim()) === 0) {
    throw createImportValidationError(
      "ip_address harus berisi alamat IPv4 atau IPv6 yang valid.",
      400,
      "INVALID_IP_ADDRESS"
    );
  }

  for (const field of ["referrer_url", "page_url"]) {
    if (!isValidHttpUrl(payload[field])) {
      throw createImportValidationError(
        `${field} harus berupa URL absolut dengan protokol HTTP atau HTTPS yang valid.`,
        400,
        "INVALID_URL"
      );
    }
  }
}

function validateIntegerFields(payload) {
  for (const field of INTEGER_FIELDS) {
    if (!Number.isInteger(payload[field])) {
      throw createImportValidationError(
        `${field} harus berupa bilangan bulat.`,
        400,
        "INVALID_INTEGER_FIELD"
      );
    }
  }
}

module.exports = {
  INTEGER_FIELDS,
  createImportValidationError,
  isValidDatasetTimestamp,
  isValidHttpUrl,
  validateDatasetSemantics,
  validateIntegerFields,
};
