"use strict";

const express = require("express");
const createEventController = require("../controllers/eventController");
const createDatasetImportController = require("../controllers/datasetImportController");

function createEventRouter(eventService) {
  const router = express.Router();
  const controller = createEventController(eventService);
  const importDataset = createDatasetImportController(eventService);

  // Static routes stay before parameterized routes such as /:clickId.
  router.post(
    "/import",
    express.raw({ type: ["text/csv", "application/csv"], limit: "10mb" }),
    importDataset
  );
  router.post("/ingest", controller.ingestEvents);
  router.post("/", controller.createEvent);
  router.get("/", controller.listEvents);
  router.get("/:clickId", controller.getEventByClickId);
  router.patch("/:clickId", controller.updateEvent);
  router.delete("/:clickId", controller.deleteEvent);

  return router;
}

module.exports = createEventRouter;
