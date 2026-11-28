"use strict";

const express = require("express");
const createGoogleAdsController = require("../controllers/googleAdsController");

function createGoogleAdsRouter(googleAdsService, options = {}) {
  const router = express.Router();
  const controller = createGoogleAdsController({ googleAdsService, env: options.env || process.env });

  router.get("/status", controller.getStatus);
  router.get("/customers", controller.listCustomers);
  router.get("/campaigns", controller.listCampaigns);
  router.get("/campaigns/:campaignId/ip-exclusions", controller.listIpBlocks);
  router.get("/training-data/model-status", controller.getTrainingStatus);
  router.post("/campaigns/:campaignId/pause", controller.pauseCampaign);
  router.post("/campaigns/:campaignId/ip-exclusions", controller.excludeIps);
  router.post("/training-data/sync", controller.syncTrainingData);

  return router;
}

module.exports = createGoogleAdsRouter;
