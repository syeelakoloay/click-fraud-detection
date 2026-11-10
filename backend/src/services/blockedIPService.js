"use strict";

const { BlockedIP } = require("../models");
const {
  assertNonEmptyString,
  normalizePagination,
  toPlainObject,
} = require("./serviceUtils");

async function addBlockedIP(ipAddress) {
  const normalizedIP = assertNonEmptyString(ipAddress, "ipAddress");
  // Idempotent insert: do not create duplicate blocked-IP records on repeat calls.
  const document = await BlockedIP.findOneAndUpdate(
    { ip_address: normalizedIP },
    { $setOnInsert: { ip_address: normalizedIP } },
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
      .sort({ ip_address: 1 })
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

module.exports = {
  addBlockedIP,
  getBlockedIP,
  isIPBlocked,
  listBlockedIPs,
  removeBlockedIP,
};
