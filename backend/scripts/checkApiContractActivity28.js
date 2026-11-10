"use strict";

// Static source-to-documentation contract check for Activity 28.
// This does not start Express or connect to MongoDB/Python.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const files = {
  app: read("src/app.js"),
  eventsRoute: read("src/routes/eventRoutes.js"),
  monitoringRoute: read("src/routes/monitoringRoutes.js"),
  blockedRoute: read("src/routes/blockedIPRoutes.js"),
  eventService: read("src/services/eventService.js"),
  monitoringController: read("src/controllers/monitoringController.js"),
  monitoringService: read("src/services/monitoringService.js"),
  blockedService: read("src/services/blockedIPService.js"),
  eventModel: read("src/models/Event.js"),
  blockedModel: read("src/models/BlockedIP.js"),
  modelRunService: read("src/services/modelRunService.js"),
  contract: read("docs/API_CONTRACT_AKTIVITAS_28.md"),
};

const checks = [
  ["Express mounts event API", /app\.use\([\s\S]*?"\/api\/events"[\s\S]*?createEventRouter/.test(files.app)],
  ["Express mounts monitoring API", /"\/api\/monitoring"[\s\S]*?createMonitoringRouter/.test(files.app)],
  ["Express mounts blocked-IP API", /app\.use\("\/api\/blocked-ips"/.test(files.app)],
  ["Express mounts health endpoint", /app\.get\("\/health"/.test(files.app)],
  ["Event route exposes list endpoint", /router\.get\("\/",\s*controller\.listEvents\)/.test(files.eventsRoute)],
  ["Event service returns pagination metadata", /totalPages:\s*Math\.ceil\(total \/ pagination\.limit\)/.test(files.eventService)],
  ["Event service supports fraud-label filtering", /normalizeBinaryLabel\(options\.is_fraudulent\)/.test(files.eventService)],
  ["Event service supports time-range filtering", /buildTimestampFilter\(options\)/.test(files.eventService)],
  ["Monitoring route exposes summary, metrics, and traffic", ["summary", "metrics", "traffic"].every((name) => new RegExp(`router\\.get\\(\"\\/${name}\"`).test(files.monitoringRoute))],
  ["Monitoring metrics fields match model contract", ["model_type", "accuracy", "precision", "recall", "f1_score", "roc_auc"].every((name) => files.monitoringController.includes(`"${name}"`))],
  ["Traffic groups use UTC", /timezone:\s*"UTC"/.test(files.monitoringService)],
  ["Blocked-IP route exposes GET list", /router\.get\("\/",\s*controller\.listBlockedIPs\)/.test(files.blockedRoute)],
  ["Blocked-IP schema contains ip_address", /ip_address:\s*\{[\s\S]*?type:\s*String/.test(files.blockedModel)],
  ["Blocked-IP service returns pagination metadata", /totalPages:\s*Math\.ceil\(total \/ pagination\.limit\)/.test(files.blockedService)],
  ["Event schema preserves is_fraudulent label", /is_fraudulent:\s*\{[\s\S]*?enum:\s*\[0,\s*1\]/.test(files.eventModel)],
  ["Contract documents event pagination", files.contract.includes("`GET /api/events`") && files.contract.includes("`page`") && files.contract.includes("`totalPages`")],
  ["Contract documents UTC traffic bucket", /timezone UTC/.test(files.contract)],
  ["Contract distinguishes risk signals from blocked IP", /Risk signals[\s\S]*?blocked IP/.test(files.contract)],
  ["Contract documents metrics-not-health distinction", files.contract.includes("health check layanan Python") && files.contract.includes("NO_MODEL_RUN_RECORDED")],
  ["Contract documents the Activity 27 real-time route boundary", files.contract.includes("/api/realtime/test-history") && files.contract.includes("Tidak menyimpan event uji")],
];

let failures = 0;
for (const [label, passed] of checks) {
  if (passed) {
    process.stdout.write(`PASS ${label}\n`);
  } else {
    failures += 1;
    process.stderr.write(`FAIL ${label}\n`);
  }
}

process.stdout.write(`\n${checks.length - failures}/${checks.length} pemeriksaan statis lulus.\n`);
if (failures) process.exitCode = 1;
