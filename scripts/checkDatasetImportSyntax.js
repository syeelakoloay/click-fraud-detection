"use strict";

const { spawnSync } = require("node:child_process");

const files = [
  "src/routes/eventRoutes.js",
  "src/controllers/datasetImportController.js",
  "src/middleware/errorHandler.js",
  "src/utils/csvParser.js",
  "src/utils/datasetImportValidation.js",
  "scripts/testCsvParser.js",
  "scripts/testDatasetImportValidation.js",
  "scripts/testDatasetImportErrorHandler.js",
  "scripts/testApiDatasetImport.js",
  "scripts/testDatasetImportMongoIntegration.js",
];

let hasError = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    hasError = true;
    process.stderr.write(`FAIL ${file}\n${result.stderr || result.stdout}`);
  } else {
    process.stdout.write(`OK   ${file}\n`);
  }
}

if (hasError) {
  process.stderr.write("Pemeriksaan sintaks import dataset gagal.\n");
  process.exitCode = 1;
} else {
  process.stdout.write(`Semua ${files.length} file lolos pemeriksaan sintaks.\n`);
}
