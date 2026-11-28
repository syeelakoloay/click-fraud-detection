"use strict";

const express = require("express");
const createEventController = require("../controllers/eventController");
const createDatasetImportController = require("../controllers/datasetImportController");
const { createIngestionAuth } = require("../middleware/requireIngestionKey");

function createEventRouter(eventService, blockedIPService, realtimePredictionService) {
  const router = express.Router();
  const controller = createEventController(eventService, blockedIPService, realtimePredictionService);
  const importDataset = createDatasetImportController(eventService, blockedIPService);
  const requireIngestionKey = createIngestionAuth();

  // Static routes stay before parameterized routes such as /:clickId.
  router.post(
    "/import",
    requireIngestionKey,
    express.raw({ type: ["text/csv", "application/csv"], limit: "10mb" }),
    importDataset
  );
  router.post("/ingest", requireIngestionKey, controller.ingestEvents);
  router.post("/", requireIngestionKey, controller.createEvent);
  router.get("/", controller.listEvents);
  router.get("/:clickId", controller.getEventByClickId);
  router.patch("/:clickId", requireIngestionKey, controller.updateEvent);
  router.delete("/:clickId", requireIngestionKey, controller.deleteEvent);

  return router;
}

module.exports = createEventRouter;
