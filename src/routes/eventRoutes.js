"use strict";

const express = require("express");
const createEventController = require("../controllers/eventController");

function createEventRouter(eventService) {
  const router = express.Router();
  const controller = createEventController(eventService);

  // Keep the static ingestion path before /:clickId to avoid route ambiguity.
  router.post("/ingest", controller.ingestEvents);
  router.post("/", controller.createEvent);
  router.get("/", controller.listEvents);
  router.get("/:clickId", controller.getEventByClickId);
  router.patch("/:clickId", controller.updateEvent);
  router.delete("/:clickId", controller.deleteEvent);

  return router;
}

module.exports = createEventRouter;
