
"use strict";

const express = require("express");

function createPredictionRouter(predictionService) {
  const router = express.Router();

  router.post("/web-robot", async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "Body harus berupa object JSON." },
        });
      }
      if (typeof predictionService.predictWebRobotSession !== "function") {
        return res.status(503).json({
          error: { code: "WEB_ROBOT_MODEL_UNAVAILABLE", message: "Prediksi sesi Web Robot tidak tersedia." },
        });
      }
      const result = await predictionService.predictWebRobotSession(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/martech", async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({
          error: { code: "INVALID_INPUT", message: "Body harus berupa object JSON." },
        });
      }
      if (typeof predictionService.predictMartech !== "function") {
        return res.status(503).json({
          error: { code: "MARTECH_BENCHMARK_UNAVAILABLE", message: "Prediksi benchmark MarTech tidak tersedia." },
        });
      }
      const result = await predictionService.predictMartech(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_INPUT",
            message: "Body harus berupa object JSON.",
          },
        });
      }

      const result = await predictionService.predict(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = createPredictionRouter;
