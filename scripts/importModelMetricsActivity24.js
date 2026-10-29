"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const mongoose = require("mongoose");
require("dotenv").config();

const connectDatabase = require("../src/config/database");
const { ModelRun } = require("../src/models");
const { createModelRun } = require("../src/services/modelRunService");

const METRICS_PATH = path.join(
  __dirname,
  "..",
  "ml",
  "results",
  "model_metrics.csv"
);

const MODEL_TYPE = "Random Forest baseline";
const METRIC_FIELDS = [
  "accuracy",
  "precision",
  "recall",
  "f1_score",
  "roc_auc",
];

function readMetrics() {
  if (!fs.existsSync(METRICS_PATH)) {
    throw new Error(`File metrik tidak ditemukan: ${METRICS_PATH}`);
  }

  const lines = fs.readFileSync(METRICS_PATH, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);

  if (lines.length < 2) {
    throw new Error("File CSV tidak memiliki baris metrik.");
  }

  const headers = lines[0].split(",").map((value) => value.trim());
  const values = lines[1].split(",").map((value) => value.trim());
  const metrics = {};

  for (const field of METRIC_FIELDS) {
    const index = headers.indexOf(field);

    if (index === -1 || values[index] === undefined) {
      throw new Error(`Kolom ${field} tidak ditemukan dalam CSV.`);
    }

    const value = Number(values[index]);

    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Nilai metrik ${field} tidak valid: ${values[index]}`);
    }

    metrics[field] = value;
  }

  return metrics;
}

async function main() {
  const metrics = readMetrics();

  console.log("\nMetrik yang dibaca dari file CSV:");
  console.log({ model_type: MODEL_TYPE, ...metrics });

  console.log(
    "\nCatatan: nilai ini berasal dari model_metrics.csv, " +
    "yang sesuai dengan model aktif di prediction_api.py."
  );

  await connectDatabase();

  const existing = await ModelRun.find({ model_type: MODEL_TYPE })
    .lean()
    .exec();

  if (existing.length > 0) {
    console.log(
      `\nDitemukan ${existing.length} record dengan model_type ` +
      `"${MODEL_TYPE}". Skrip tidak akan menambahkan record baru ` +
      "agar tidak membuat duplikat."
    );
    console.log("Periksa record yang ada sebelum memutuskan langkah berikutnya.");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      "\nSimpan metrik ini ke MongoDB? Ketik YA untuk melanjutkan: "
    );

    if (answer.trim() !== "YA") {
      console.log("Dibatalkan. Tidak ada record baru yang dibuat.");
      return;
    }

    const created = await createModelRun({
      model_type: MODEL_TYPE,
      ...metrics,
    });

    console.log("\nBerhasil menyimpan metrik model ke MongoDB.");
    console.log(created);
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error("\nGagal memproses metrik:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
