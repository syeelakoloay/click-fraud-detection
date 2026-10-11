"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const files = [
  "src/services/serviceUtils.js",
  "src/services/eventService.js",
  "src/services/blockedIPService.js",
  "src/services/modelRunService.js",
  "src/services/monitoringService.js",
  "src/services/index.js",
  "scripts/testActivity8Services.js",
  "scripts/testActivity8Utils.js",
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", path.resolve(file)], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `Syntax error: ${file}\n`);
    process.exit(result.status || 1);
  }
  console.log(`OK - ${file}`);
}
console.log(`Pemeriksaan sintaks lulus (${files.length} file).`);
