"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ModelRun } = require("../models");

const MODEL_TYPE_FROM_ARTIFACT = "Random Forest baseline";
const MODEL_METRICS_PATH = path.resolve(__dirname, "../../ml/results/model_metrics.csv");
const WEB_ROBOT_METRICS_PATH = path.resolve(__dirname, "../../ml/results/web_robot_model_metrics.json");
const METRIC_FIELDS = ["accuracy", "precision", "recall", "f1_score", "roc_auc"];

function readWebRobotMetricsArtifact() {
  try {
    const artifact = JSON.parse(fs.readFileSync(WEB_ROBOT_METRICS_PATH, "utf8"));
    const metrics = artifact.test_metrics || {};
    const required = ["accuracy", "balanced_accuracy", "precision_robot", "recall_robot", "f1_robot", "roc_auc"];
    if (!required.every((field) => Number.isFinite(Number(metrics[field])))) return null;
    return {
      model_type: artifact.model_type || "Web Robot classifier",
      model_scope: artifact.model_scope || "web_session_robot_detection",
      source_dataset: artifact.source_dataset || "Web Robot Detection",
      label_mapping: artifact.label_mapping || { "0": "Human", "1": "Robot" },
      rows_total: Number(artifact.rows_total) || null,
      test_rows: Number(metrics.rows) || null,
      test_metrics: Object.fromEntries(required.map((field) => [field, Number(metrics[field])])),
      cross_validation_accuracy: Number(artifact.cross_validation_on_training_split?.accuracy?.mean) || null,
      quality_checks: artifact.quality_checks || {},
      meets_quality_gate: artifact.meets_robot_model_quality_gate === true,
      automation_eligible: false,
      fraud_click_classifier: false,
      warning: String(artifact.warning || "Model ini mengklasifikasikan sesi Human/Robot, bukan klik Valid/Fraud."),
    };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

function readModelMetricsArtifact() {
  if (!fs.existsSync(MODEL_METRICS_PATH)) {
    throw new Error(`Artefak metrik model tidak ditemukan: ${MODEL_METRICS_PATH}`);
  }
  const lines = fs.readFileSync(MODEL_METRICS_PATH, "utf8")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (lines.length < 2) throw new Error("Artefak metrik model tidak memiliki baris hasil.");
  const headers = lines[0].split(",").map((value) => value.trim());
  const values = lines[1].split(",").map((value) => value.trim());
  const metrics = {};
  for (const field of METRIC_FIELDS) {
    const index = headers.indexOf(field);
    const value = Number(values[index]);
    if (index < 0 || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`Nilai metrik ${field} pada artefak tidak valid.`);
    }
    metrics[field] = value;
  }
  return metrics;
}
const {
  assertNonEmptyString,
  normalizePagination,
  toPlainObject,
} = require("./serviceUtils");

async function createModelRun(modelRunData) {
  if (!modelRunData || typeof modelRunData !== "object" || Array.isArray(modelRunData)) {
    throw new TypeError("modelRunData harus berupa object hasil model run.");
  }
  if (typeof modelRunData.model_type !== "string" || !modelRunData.model_type.trim()) {
    throw new TypeError("model_type wajib berupa teks yang tidak kosong.");
  }
  const created = await ModelRun.create({
    ...modelRunData,
    model_type: modelRunData.model_type.trim(),
  });
  return toPlainObject(created);
}

async function getModelRunById(id) {
  const normalizedId = assertNonEmptyString(id, "id");
  return ModelRun.findById(normalizedId).lean().exec();
}

async function listModelRuns(options = {}) {
  const pagination = normalizePagination(options, { limit: 50, maxLimit: 100 });
  const [data, total] = await Promise.all([
    ModelRun.find({})
      .sort({ _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean()
      .exec(),
    ModelRun.countDocuments({}).exec(),
  ]);

  return {
    data,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

async function syncModelMetricsFromArtifact() {
  const metrics = readModelMetricsArtifact();
  const record = await ModelRun.findOneAndUpdate(
    { model_type: MODEL_TYPE_FROM_ARTIFACT },
    { $set: { model_type: MODEL_TYPE_FROM_ARTIFACT, ...metrics } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean().exec();
  return toPlainObject(record);
}

async function getLatestModelRun() {
  // Prefer metrics for the model artifact loaded by prediction_api.py.
  const activeArtifactRun = await ModelRun.findOne({ model_type: MODEL_TYPE_FROM_ARTIFACT })
    .sort({ _id: -1 })
    .lean()
    .exec();
  if (activeArtifactRun) return activeArtifactRun;

  // Fallback for other registered model runs when the active artifact has not been synced.
  return ModelRun.findOne({}).sort({ _id: -1 }).lean().exec();
}

async function getModelStatus() {
  const latestModelRun = await getLatestModelRun();
  return {
    status: latestModelRun ? "RESULT_RECORDED" : "NO_MODEL_RUN_RECORDED",
    hasRecordedRun: Boolean(latestModelRun),
    latestModelRun,
    note: latestModelRun
      ? "Metrik evaluasi model tersimpan di MongoDB. Status ini tidak membuktikan layanan prediksi Python sedang aktif."
      : "Belum ada hasil model run tersimpan di MongoDB.",
  };
}

module.exports = {
  createModelRun,
  readModelMetricsArtifact,
  readWebRobotMetricsArtifact,
  syncModelMetricsFromArtifact,
  getModelRunById,
  listModelRuns,
  getLatestModelRun,
  getModelStatus,
};
