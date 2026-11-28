"use strict";

const express = require("express");
const createBlockedIPController = require("../controllers/blockedIPController");

function createBlockedIPRouter(blockedIPService) {
  const router = express.Router();
  const controller = createBlockedIPController(blockedIPService);

  router.get("/", controller.listBlockedIPs);

  return router;
}

module.exports = createBlockedIPRouter;
