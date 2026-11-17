"use strict";

const { BlockedIP, Event } = require("../models");
const {
  assertNonEmptyString,
  normalizePagination,
  toPlainObject,
} = require("./serviceUtils");

async function addBlockedIP(ipAddress, options = {}) {
  const normalizedIP = assertNonEmptyString(ipAddress, "ipAddress");
  const source = ["historical_dataset_label", "ml_prediction", "manual"].includes(options.source)
    ? options.source
    : "manual";
  const now = new Date();

  // A model detection has priority over a historical dataset-derived entry.
  const update = source === "ml_prediction"
    ? { $set: { source, last_seen_at: now } }
    : { $setOnInsert: { ip_address: normalizedIP, source, blocked_at: now } };

  const document = await BlockedIP.findOneAndUpdate(
    { ip_address: normalizedIP },
    update,
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).exec();
  return toPlainObject(document);
}

async function getBlockedIP(ipAddress) {
  const normalizedIP = assertNonEmptyString(ipAddress, "ipAddress");
  return BlockedIP.findOne({ ip_address: normalizedIP }).lean().exec();
}

async function isIPBlocked(ipAddress) {
  return Boolean(await getBlockedIP(ipAddress));
}

async function listBlockedIPs(options = {}) {
  const pagination = normalizePagination(options, { limit: 50, maxLimit: 100 });
  const [data, total] = await Promise.all([
    BlockedIP.find({})
      .sort({ blocked_at: -1, ip_address: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean()
      .exec(),
    BlockedIP.countDocuments({}).exec(),
  ]);

  return {
    data,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

async function removeBlockedIP(ipAddress) {
  const normalizedIP = assertNonEmptyString(ipAddress, "ipAddress");
  const result = await BlockedIP.deleteOne({ ip_address: normalizedIP }).exec();
  return {
    ip_address: normalizedIP,
    deleted: result.deletedCount === 1,
  };
}

/**
 * Backfill the internal blocklist from known historical Fraud labels.
 * This deliberately does NOT call these rows ML predictions: the source is
 * explicitly recorded as historical_dataset_label. Existing ML/manual entries
 * are preserved, and the operation is safe to repeat after server restart/import.
 */
async function syncHistoricalFraudIPs() {
  const records = await Event.aggregate([
    {
      $match: {
        is_fraudulent: 1,
        ip_address: { $type: "string", $ne: "" },
      },
    },
    {
      $group: {
        _id: "$ip_address",
        event_count: { $sum: 1 },
        last_seen_at: { $max: "$timestamp" },
      },
    },
  ]).exec();

  if (records.length === 0) {
    return { source: "historical_dataset_label", matchedIPs: 0, upsertedCount: 0 };
  }

  const operations = records.map((record) => ({
    updateOne: {
      filter: { ip_address: record._id },
      update: {
        $setOnInsert: {
          ip_address: record._id,
          source: "historical_dataset_label",
          source_event_count: record.event_count,
          blocked_at: new Date(),
        },
        $set: { last_seen_at: record.last_seen_at || null },
      },
      upsert: true,
    },
  }));

  const result = await BlockedIP.bulkWrite(operations, { ordered: false });
  return {
    source: "historical_dataset_label",
    matchedIPs: records.length,
    upsertedCount: result.upsertedCount || 0,
  };
}

module.exports = {
  addBlockedIP,
  getBlockedIP,
  isIPBlocked,
  listBlockedIPs,
  removeBlockedIP,
  syncHistoricalFraudIPs,
};
