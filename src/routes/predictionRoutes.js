
"use strict";

const express = require("express");

function createPredictionRouter(predictionService) {
  const router = express.Router();

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
