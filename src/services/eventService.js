"use strict";

const { Event } = require("../models");
const {
  assertNonEmptyString,
  normalizePagination,
  buildTimestampFilter,
  normalizeBinaryLabel,
  toPlainObject,
} = require("./serviceUtils");

const ALLOWED_SORT_FIELDS = new Set([
  "timestamp",
  "click_id",
  "is_fraudulent",
]);

async function createEvent(eventData) {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    throw new TypeError("eventData harus berupa object event.");
  }
  const created = await Event.create(eventData);
  return toPlainObject(created);
}

async function getEventByClickId(clickId) {
  const normalizedClickId = assertNonEmptyString(clickId, "clickId");
  return Event.findOne({ click_id: normalizedClickId }).lean().exec();
}

async function getEventById(id) {
  const normalizedId = assertNonEmptyString(id, "id");
  return Event.findById(normalizedId).lean().exec();
}

async function listEvents(options = {}) {
  const pagination = normalizePagination(options, { limit: 50, maxLimit: 100 });
  const filter = {
    ...buildTimestampFilter(options),
  };

  if (options.click_id !== undefined && options.click_id !== "") {
    filter.click_id = assertNonEmptyString(options.click_id, "click_id");
  }
  if (options.ip_address !== undefined && options.ip_address !== "") {
    filter.ip_address = assertNonEmptyString(options.ip_address, "ip_address");
  }
  if (options.device_type !== undefined && options.device_type !== "") {
    filter.device_type = assertNonEmptyString(options.device_type, "device_type");
  }
  const fraudLabel = normalizeBinaryLabel(options.is_fraudulent);
  if (fraudLabel !== undefined) filter.is_fraudulent = fraudLabel;

  const requestedSortField = options.sortBy ?? "timestamp";
  if (!ALLOWED_SORT_FIELDS.has(requestedSortField)) {
    throw new TypeError(
      `sortBy harus salah satu dari: ${Array.from(ALLOWED_SORT_FIELDS).join(", ")}.`
    );
  }
  const sortDirection = options.sortOrder ?? "desc";
  if (sortDirection !== "asc" && sortDirection !== "desc") {
    throw new TypeError('sortOrder hanya menerima "asc" atau "desc".');
  }
  const sort = { [requestedSortField]: sortDirection === "asc" ? 1 : -1 };

  const [data, total] = await Promise.all([
    Event.find(filter)
      .sort(sort)
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean()
      .exec(),
    Event.countDocuments(filter).exec(),
  ]);

  return {
    data,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

async function countEvents(options = {}) {
  const filter = buildTimestampFilter(options);
  const fraudLabel = normalizeBinaryLabel(options.is_fraudulent);
  if (fraudLabel !== undefined) filter.is_fraudulent = fraudLabel;
  if (options.ip_address !== undefined && options.ip_address !== "") {
    filter.ip_address = assertNonEmptyString(options.ip_address, "ip_address");
  }
  return Event.countDocuments(filter).exec();
}

async function findEventsByIP(ipAddress, options = {}) {
  return listEvents({ ...options, ip_address: assertNonEmptyString(ipAddress, "ipAddress") });
}

module.exports = {
  createEvent,
  getEventByClickId,
  getEventById,
  listEvents,
  countEvents,
  findEventsByIP,
};
