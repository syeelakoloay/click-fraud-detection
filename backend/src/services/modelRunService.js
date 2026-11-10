"use strict";

const { ModelRun } = require("../models");
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

async function getLatestModelRun() {
  // ModelRun's existing Activity 6 schema has no createdAt field. ObjectId ordering
  // is used only as an insertion-order approximation; it is not a training timestamp.
  return ModelRun.findOne({}).sort({ _id: -1 }).lean().exec();
}

async function getModelStatus() {
  const latestModelRun = await getLatestModelRun();
  return {
    status: latestModelRun ? "RESULT_RECORDED" : "NO_MODEL_RUN_RECORDED",
    hasRecordedRun: Boolean(latestModelRun),
    latestModelRun,
    note: latestModelRun
      ? "Ada hasil model run tersimpan. Status ini tidak membuktikan layanan prediksi sedang aktif."
      : "Belum ada hasil model run tersimpan di MongoDB.",
  };
}

module.exports = {
  createModelRun,
  getModelRunById,
  listModelRuns,
  getLatestModelRun,
  getModelStatus,
};
