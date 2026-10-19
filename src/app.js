"use strict";

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const defaultServices = require("./services");
const createEventRouter = require("./routes/eventRoutes");
const createMonitoringRouter = require("./routes/monitoringRoutes");
const createBlockedIPRouter = require("./routes/blockedIPRoutes");
const { errorHandler } = require("./middleware/errorHandler");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
];

function parseAllowedOrigins(value) {
  if (Array.isArray(value)) {
    return value.map((origin) => String(origin).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((origin) => origin.trim()).filter(Boolean);
  }
  return [...DEFAULT_ALLOWED_ORIGINS];
}

function createApp(options = {}) {
  const services = { ...defaultServices, ...(options.services || {}) };
  const getDatabaseState = options.getDatabaseState || (() => mongoose.connection.readyState);
  const allowedOrigins = parseAllowedOrigins(
    options.allowedOrigins === undefined ? process.env.CORS_ORIGINS : options.allowedOrigins
  );
  const app = express();

  app.disable("x-powered-by");

  app.use(
    cors({
      origin(origin, callback) {
        // Requests from curl/Postman/server-to-server clients have no Origin header.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        const error = new Error("Origin tidak diizinkan oleh kebijakan CORS.");
        error.status = 403;
        return callback(error);
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      maxAge: 600,
      optionsSuccessStatus: 204,
    })
  );

  app.use(express.json({ limit: "10mb", strict: true }));

  app.get("/health", (_req, res) => {
    const connected = getDatabaseState() === 1;
    return res.status(connected ? 200 : 503).json({
      status: connected ? "ok" : "degraded",
      service: "click-fraud-detection-api",
      database: connected ? "connected" : "disconnected",
    });
  });

  app.use("/api/events", createEventRouter(services.eventService));
  app.use(
    "/api/monitoring",
    createMonitoringRouter({
      monitoringService: services.monitoringService,
      modelRunService: services.modelRunService,
    })
  );
  app.use("/api/blocked-ips", createBlockedIPRouter(services.blockedIPService));

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint tidak ditemukan.",
      },
    });
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp, parseAllowedOrigins, DEFAULT_ALLOWED_ORIGINS };
