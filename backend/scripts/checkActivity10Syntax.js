"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const files = [
  "src/app.js",
  "src/server.js",
  "src/routes/eventRoutes.js",
  "src/controllers/eventController.js",
  "src/middleware/errorHandler.js",
  "src/services/eventService.js",
  "scripts/testApiActivity10.js",
  "scripts/testMongoIntegrationActivity10.js",
];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.resolve(file)], { encoding: "utf8" });
  if (result.status === 0) {
    console.log(`OK - ${file}`);
  } else {
    failed = true;
    console.error(`GAGAL - ${file}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}
if (failed) process.exitCode = 1;
else console.log(`Pemeriksaan sintaks Aktivitas 10 lulus (${files.length} file).`);
