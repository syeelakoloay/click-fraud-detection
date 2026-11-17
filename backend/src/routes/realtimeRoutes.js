"use strict";

const express = require("express");

function createRealtimeRouter(realtimePredictionService) {
  const router = express.Router();

  // POST /api/realtime/ingest: predict, persist, and add Fraud IPs to the internal blocklist.
  router.post("/ingest", async (req, res, next) => {
    try {
      const result = await realtimePredictionService.ingestAndPredict(req.body);
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof TypeError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: error.message },
        });
      }
      return next(error);
    }
  });

  // Retained for backward-compatible Activity 17/23/25/27 testing.
  router.post("/test-history", async (req, res, next) => {
    try {
      const result = await realtimePredictionService.predictWithHistory(req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof TypeError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: error.message },
        });
      }
      return next(error);
    }
  });

  return router;
}

module.exports = createRealtimeRouter;
