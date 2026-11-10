"use strict";

const { Event } = require("../models");
const { buildTimestampFilter, parseDate } = require("./serviceUtils");
const { listBlockedIPs } = require("./blockedIPService");
const { getModelStatus } = require("./modelRunService");

async function getOverview(options = {}) {
  const match = buildTimestampFilter(options);
  const [result] = await Event.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        fraudCount: {
          $sum: { $cond: [{ $eq: ["$is_fraudulent", 1] }, 1, 0] },
        },
        validCount: {
          $sum: { $cond: [{ $eq: ["$is_fraudulent", 0] }, 1, 0] },
        },
        latestEventAt: { $max: "$timestamp" },
      },
    },
  ]).exec();

  const totalEvents = result?.totalEvents ?? 0;
  const fraudCount = result?.fraudCount ?? 0;
  const validCount = result?.validCount ?? 0;

  return {
    totalEvents,
    fraudCount,
    validCount,
    fraudRate: totalEvents === 0 ? 0 : Number(((fraudCount / totalEvents) * 100).toFixed(2)),
    latestEventAt: result?.latestEventAt ?? null,
  };
}

async function getTrafficByTime(options = {}) {
  const interval = options.interval ?? "hour";
  if (interval !== "hour" && interval !== "day") {
    throw new TypeError('interval hanya menerima "hour" atau "day".');
  }
  const match = buildTimestampFilter(options);
  const dateFormat = interval === "hour" ? "%Y-%m-%dT%H:00:00.000Z" : "%Y-%m-%d";

  const data = await Event.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: dateFormat,
            date: "$timestamp",
            timezone: "UTC",
          },
        },
        totalEvents: { $sum: 1 },
        fraudCount: {
          $sum: { $cond: [{ $eq: ["$is_fraudulent", 1] }, 1, 0] },
        },
        validCount: {
          $sum: { $cond: [{ $eq: ["$is_fraudulent", 0] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalEvents: 1,
        fraudCount: 1,
        validCount: 1,
      },
    },
  ]).exec();

  return { interval, data };
}

async function getMonitoringSnapshot(options = {}) {
  // Validate and normalize supplied range once before passing it to both queries.
  const startDate = parseDate(options.startDate, "startDate");
  const endDate = parseDate(options.endDate, "endDate");
  if (startDate && endDate && startDate > endDate) {
    throw new RangeError("startDate tidak boleh lebih besar daripada endDate.");
  }
  const range = { startDate, endDate };
  const [overview, traffic, blockedIPs, modelStatus] = await Promise.all([
    getOverview(range),
    getTrafficByTime({ ...range, interval: options.interval ?? "hour" }),
    listBlockedIPs({ page: 1, limit: options.blockedIPLimit ?? 50 }),
    getModelStatus(),
  ]);

  return { overview, traffic, blockedIPs, modelStatus };
}

module.exports = {
  getOverview,
  getTrafficByTime,
  getMonitoringSnapshot,
};
