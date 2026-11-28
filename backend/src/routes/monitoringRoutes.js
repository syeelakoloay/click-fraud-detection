"use strict";

const express = require("express");
const createMonitoringController = require("../controllers/monitoringController");

function createMonitoringRouter(services) {
  const router = express.Router();
  const controller = createMonitoringController(services);

  router.get("/summary", controller.getSummary);
  router.get("/metrics", controller.getMetrics);
  router.get("/traffic", controller.getTraffic);

  return router;
}

module.exports = createMonitoringRouter;
