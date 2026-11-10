"use strict";

// Route UJI Aktivitas 17 (PIC: Finkly).
// Mengikuti pola router lain di proyek: factory function yang menerima service.
// Route ini TIDAK menyimpan event ke database.
// Nanti digabung dengan endpoint resmi prediction milik Miceflona.

const express = require("express");

function createRealtimeRouter(realtimePredictionService) {
  const router = express.Router();

  // POST /api/realtime/test-history
  router.post("/test-history", async (req, res) => {
    try {
      const result = await realtimePredictionService.predictWithHistory(req.body);
      return res.json(result);
    } catch (err) {
      // TypeError = input tidak valid (kebiasaan service Syeela juga)
      if (err instanceof TypeError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: err.message },
        });
      }
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message },
      });
    }
  });

  return router;
}

module.exports = createRealtimeRouter;
