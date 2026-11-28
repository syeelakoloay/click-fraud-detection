"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const files = [
  "src/app.js",
  "src/controllers/monitoringController.js",
  "src/controllers/blockedIPController.js",
  "src/routes/monitoringRoutes.js",
  "src/routes/blockedIPRoutes.js",
  "tests/monitoringController.test.js",
  "tests/blockedIPController.test.js",
  "scripts/testMonitoringIntegrationActivity13.js",
];
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.resolve(file)], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.log(`OK - ${file}`);
  } else {
    failed = true;
    console.error(`GAGAL - ${file}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Pemeriksaan sintaks Aktivitas 13 lulus (${files.length} file).`);
}
