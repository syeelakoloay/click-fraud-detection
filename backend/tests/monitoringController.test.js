"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createMonitoringController = require("../src/controllers/monitoringController");

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("GET summary meneruskan filter dan membungkus snapshot sebagai data", async () => {
  let receivedOptions;
  const snapshot = {
    overview: { totalEvents: 12, fraudCount: 3, validCount: 9, fraudRate: 25, latestEventAt: null },
    traffic: { interval: "day", data: [] },
    blockedIPs: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 },
    modelStatus: { status: "NO_MODEL_RUN_RECORDED", hasRecordedRun: false, latestModelRun: null },
  };
  const controller = createMonitoringController({
    monitoringService: {
      async getMonitoringSnapshot(options) {
        receivedOptions = options;
        return snapshot;
      },
      async getTrafficByTime() { throw new Error("Tidak digunakan dalam tes ini"); },
    },
    modelRunService: { async getModelStatus() { return {}; } },
  });
  const res = responseRecorder();

  await controller.getSummary({ query: {
    startDate: "2026-10-01",
    endDate: "2026-10-18",
    interval: "day",
    blockedIPLimit: "25",
  } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { data: snapshot });
  assert.deepEqual(receivedOptions, {
    startDate: "2026-10-01",
    endDate: "2026-10-18",
    interval: "day",
    blockedIPLimit: "25",
  });
});

test("GET metrics hanya mengembalikan field evaluasi model yang tersedia", async () => {
  const controller = createMonitoringController({
    monitoringService: { async getMonitoringSnapshot() { return {}; }, async getTrafficByTime() { return {}; } },
    modelRunService: {
      async getModelStatus() {
        return {
          status: "RESULT_RECORDED",
          note: "Ada hasil model run tersimpan. Status ini tidak membuktikan layanan prediksi sedang aktif.",
          latestModelRun: {
            model_type: "Random Forest",
            accuracy: 0.734,
            precision: 0.2353,
            recall: 0.0323,
            f1_score: 0.0567,
            roc_auc: 0.4949,
            internal_note: "Tidak diekspos endpoint metrics",
          },
        };
      },
    },
  });
  const res = responseRecorder();

  await controller.getMetrics({}, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, {
    model_type: "Random Forest",
    accuracy: 0.734,
    precision: 0.2353,
    recall: 0.0323,
    f1_score: 0.0567,
    roc_auc: 0.4949,
  });
  assert.equal(res.body.status, "RESULT_RECORDED");
  assert.match(res.body.note, /tidak membuktikan layanan prediksi sedang aktif/i);
});

test("GET metrics tidak membuat angka ketika belum ada model run", async () => {
  const controller = createMonitoringController({
    monitoringService: { async getMonitoringSnapshot() { return {}; }, async getTrafficByTime() { return {}; } },
    modelRunService: {
      async getModelStatus() {
        return {
          status: "NO_MODEL_RUN_RECORDED",
          note: "Belum ada hasil model run tersimpan di MongoDB.",
          latestModelRun: null,
        };
      },
    },
  });
  const res = responseRecorder();

  await controller.getMetrics({}, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data, null);
  assert.equal(res.body.status, "NO_MODEL_RUN_RECORDED");
});

test("GET traffic meneruskan filter tanggal dan interval", async () => {
  let receivedOptions;
  const traffic = { interval: "hour", data: [{ period: "2026-10-18T10:00:00.000Z", totalEvents: 4, fraudCount: 1, validCount: 3 }] };
  const controller = createMonitoringController({
    monitoringService: {
      async getMonitoringSnapshot() { return {}; },
      async getTrafficByTime(options) { receivedOptions = options; return traffic; },
    },
    modelRunService: { async getModelStatus() { return {}; } },
  });
  const res = responseRecorder();

  await controller.getTraffic({ query: { startDate: "2026-10-18", endDate: "2026-10-19", interval: "hour" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { data: traffic });
  assert.deepEqual(receivedOptions, { startDate: "2026-10-18", endDate: "2026-10-19", interval: "hour" });
});

test("error service diteruskan ke middleware error", async () => {
  const serviceError = new Error("database unavailable");
  let forwardedError;
  const controller = createMonitoringController({
    monitoringService: {
      async getMonitoringSnapshot() { throw serviceError; },
      async getTrafficByTime() { return {}; },
    },
    modelRunService: { async getModelStatus() { return {}; } },
  });
  const res = responseRecorder();

  await controller.getSummary({ query: {} }, res, (error) => { forwardedError = error; });

  assert.equal(forwardedError, serviceError);
  assert.equal(res.body, null);
});
