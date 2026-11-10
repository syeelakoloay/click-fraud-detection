"use strict";

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} harus berupa teks yang tidak kosong.`);
  }
  return value.trim();
}

function normalizePagination(options = {}, defaults = {}) {
  const defaultPage = defaults.page ?? 1;
  const defaultLimit = defaults.limit ?? 50;
  const maxLimit = defaults.maxLimit ?? 100;

  const page = options.page === undefined ? defaultPage : Number(options.page);
  const limit = options.limit === undefined ? defaultLimit : Number(options.limit);

  if (!Number.isInteger(page) || page < 1) {
    throw new TypeError("page harus berupa bilangan bulat minimal 1.");
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit harus berupa bilangan bulat minimal 1.");
  }

  return {
    page,
    limit: Math.min(limit, maxLimit),
    skip: (page - 1) * Math.min(limit, maxLimit),
  };
}

function parseDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${fieldName} bukan tanggal yang valid.`);
  }
  return date;
}

function buildTimestampFilter(options = {}) {
  const startDate = parseDate(options.startDate, "startDate");
  const endDate = parseDate(options.endDate, "endDate");

  if (startDate && endDate && startDate > endDate) {
    throw new RangeError("startDate tidak boleh lebih besar daripada endDate.");
  }

  const timestamp = {};
  if (startDate) timestamp.$gte = startDate;
  if (endDate) timestamp.$lte = endDate;

  return Object.keys(timestamp).length ? { timestamp } : {};
}

function normalizeBinaryLabel(value, fieldName = "is_fraudulent") {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (parsed !== 0 && parsed !== 1) {
    throw new TypeError(`${fieldName} hanya menerima nilai 0 atau 1.`);
  }
  return parsed;
}

function toPlainObject(document) {
  if (!document) return null;
  return typeof document.toObject === "function" ? document.toObject() : document;
}

module.exports = {
  assertNonEmptyString,
  normalizePagination,
  parseDate,
  buildTimestampFilter,
  normalizeBinaryLabel,
  toPlainObject,
};
