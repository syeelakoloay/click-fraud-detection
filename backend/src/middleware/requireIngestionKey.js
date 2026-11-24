"use strict";

const { timingSafeEqual } = require("node:crypto");

function createIngestionAuth(options = {}) {
  const expectedKey = String(options.apiKey ?? process.env.EVENT_INGESTION_API_KEY ?? "").trim();
  const isProduction = String(options.nodeEnv ?? process.env.NODE_ENV ?? "development") === "production";

  return function requireIngestionKey(req, res, next) {
    if (!expectedKey) {
      if (isProduction) {
        return res.status(503).json({
          error: {
            code: "INGESTION_AUTH_NOT_CONFIGURED",
            message: "EVENT_INGESTION_API_KEY wajib dikonfigurasi sebelum endpoint penulisan event dibuka di production.",
          },
        });
      }
      return next();
    }

    const suppliedKey = String(
      (typeof req.get === "function" && req.get("x-event-ingestion-key")) || ""
    );
    const expected = Buffer.from(expectedKey, "utf8");
    const supplied = Buffer.from(suppliedKey, "utf8");
    const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied);

    if (!matches) {
      return res.status(401).json({
        error: {
          code: "INVALID_INGESTION_KEY",
          message: "Kunci ingestion tidak valid atau tidak disertakan.",
        },
      });
    }
    return next();
  };
}

module.exports = { createIngestionAuth };
