"use strict";

require("dotenv").config();

const assert = require("node:assert/strict");
const { randomBytes, randomInt, randomUUID } = require("node:crypto");
const test = require("node:test");
const mongoose = require("mongoose");
const Event = require("../src/models/Event");
const BlockedIP = require("../src/models/BlockedIP");
const ModelRun = require("../src/models/ModelRun");
const { createApp } = require("../src/app");

const DEFAULT_TEST_MONGODB_URI =
  "mongodb://127.0.0.1:27017/click_fraud_detection_test";
const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || DEFAULT_TEST_MONGODB_URI;
const MAIN_MONGODB_URI = process.env.MONGODB_URI;
const PAGE_LIMIT = 100;

function getDatabaseName(uri, variableName) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch (_) {
    throw new Error(`${variableName} bukan URI MongoDB yang valid.`);
  }

  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) {
    throw new Error(`${variableName} harus memakai skema mongodb:// atau mongodb+srv://.`);
  }

  return decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
}

function validateTestDatabaseUri() {
  const testDatabaseName = getDatabaseName(TEST_MONGODB_URI, "TEST_MONGODB_URI");

  if (!/_test(?:ing)?$/i.test(testDatabaseName)) {
    throw new Error(
      `Pengujian dibatalkan: database TEST_MONGODB_URI harus berakhiran _test atau _testing (saat ini: "${testDatabaseName || "(kosong)"}").`
    );
  }

  if (MAIN_MONGODB_URI) {
    const mainDatabaseName = getDatabaseName(MAIN_MONGODB_URI, "MONGODB_URI");
    if (mainDatabaseName && mainDatabaseName === testDatabaseName) {
      throw new Error(
        "Pengujian dibatalkan: TEST_MONGODB_URI menunjuk ke nama database yang sama dengan MONGODB_URI. Gunakan database khusus pengujian."
      );
    }
  }

  return testDatabaseName;
}

function makeEvent(clickId, timestamp, label, ipAddress, token) {
  return {
    click_id: clickId,
    timestamp: timestamp.toISOString(),
    user_id: `activity13-it-user-${token}`,
    ip_address: ipAddress,
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    referrer_url: "https://example.com/activity13-test-referrer",
    page_url: "https://example.com/activity13-test-page",
    click_duration: 1.25,
    scroll_depth: 50,
    mouse_movement: 4,
    keystrokes_detected: 0,
    ad_position: "Top",
    click_frequency: 1,
    time_since_last_click: 1,
    device_ip_reputation: "Good",
    VPN_usage: 0,
    proxy_usage: 0,
    bot_likelihood_score: 0.1,
    is_fraudulent: label,
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(
      `Respons bukan JSON yang valid (HTTP ${response.status}): ${text.slice(0, 300)}`
    );
  }
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function findUnusedTestIP() {
  // Documentation-only IPv4 ranges; values are generated and used only in the test DB.
  const ranges = ["198.51.100", "203.0.113"];
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const candidate = `${ranges[randomInt(0, ranges.length)]}.${randomInt(1, 255)}`;
    if (!(await BlockedIP.exists({ ip_address: candidate }))) return candidate;
  }
  throw new Error("Tidak berhasil mendapatkan IP fixture kosong di database pengujian.");
}

function createFutureTestObjectId() {
  // ModelRun is sorted by _id because its existing schema has no createdAt.
  // A future timestamp in this test-only ObjectId makes the inserted fixture the latest run.
  const timestamp = Math.floor(Date.UTC(2100, 0, 1) / 1000)
    .toString(16)
    .padStart(8, "0");
  return new mongoose.Types.ObjectId(`${timestamp}${randomBytes(8).toString("hex")}`);
}

function randomFutureTimeRange() {
  // A randomly selected hour in 2099 isolates test rows from the project's real dataset.
  const hoursInFiveYears = 5 * 366 * 24;
  const offsetHours = randomInt(0, hoursInFiveYears);
  const start = new Date(Date.UTC(2099, 0, 1) + offsetHours * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  return {
    first: start,
    second: new Date(start.getTime() + 60 * 60 * 1000),
    startDate: new Date(start.getTime() - 1000).toISOString(),
    endDate: new Date(start.getTime() + 60 * 60 * 1000 + 1000).toISOString(),
  };
}

test(
  "Aktivitas 13: integrasi endpoint monitoring dengan Express dan MongoDB aktual",
  { timeout: 60000 },
  async (t) => {
    const testDatabaseName = validateTestDatabaseUri();
    const token = randomUUID();
    const clickIds = [`activity13-it-${token}-valid`, `activity13-it-${token}-fraud`];
    const ownedModelRunId = createFutureTestObjectId();
    const modelType = `activity13-integration-${token}`;
    const timeRange = randomFutureTimeRange();
    const firstEventIP = "192.0.2.10";
    const secondEventIP = "192.0.2.11";
    let ownedBlockedIP;
    let blockedIPInserted = false;
    let modelRunInserted = false;
    let server;
    let baseUrl;

    t.diagnostic(`Database pengujian aktual: ${testDatabaseName}`);
    t.diagnostic("Suite memakai Express, service, Mongoose, dan MongoDB aktual; tidak memakai mock service.");
    t.diagnostic("Skrip hanya menghapus record dengan ID/IP unik yang dibuat oleh eksekusi ini.");

    try {
      await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      assert.equal(mongoose.connection.readyState, 1, "Koneksi MongoDB pengujian harus aktif.");
      await Promise.all([Event.init(), BlockedIP.init(), ModelRun.init()]);

      ownedBlockedIP = await findUnusedTestIP();
      await BlockedIP.create({ ip_address: ownedBlockedIP });
      blockedIPInserted = true;

      await ModelRun.create({
        _id: ownedModelRunId,
        model_type: modelType,
        accuracy: 0.91,
        precision: 0.92,
        recall: 0.93,
        f1_score: 0.925,
        roc_auc: 0.94,
      });
      modelRunInserted = true;

      const started = await listen(createApp());
      server = started.server;
      baseUrl = started.baseUrl;
      t.diagnostic(`Express test server: ${baseUrl}`);

      const eventPayloads = [
        makeEvent(clickIds[0], timeRange.first, 0, firstEventIP, token),
        makeEvent(clickIds[1], timeRange.second, 1, secondEventIP, token),
      ];
      for (const payload of eventPayloads) {
        const response = await fetch(`${baseUrl}/api/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await readJson(response);
        assert.equal(response.status, 201, `Event fixture harus tersimpan melalui API: ${JSON.stringify(body)}`);
        assert.equal(body.data.click_id, payload.click_id);
      }

      await t.test("GET /api/monitoring/summary membaca agregasi dan catatan dari MongoDB", async () => {
        const query = new URLSearchParams({
          startDate: timeRange.startDate,
          endDate: timeRange.endDate,
          interval: "hour",
          blockedIPLimit: "100",
        });
        const response = await fetch(`${baseUrl}/api/monitoring/summary?${query}`);
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));

        const { overview, traffic, blockedIPs, modelStatus } = body.data;
        assert.equal(overview.totalEvents, 2);
        assert.equal(overview.fraudCount, 1);
        assert.equal(overview.validCount, 1);
        assert.equal(overview.fraudRate, 50);
        assert.equal(new Date(overview.latestEventAt).toISOString(), timeRange.second.toISOString());
        assert.equal(traffic.interval, "hour");
        assert.equal(traffic.data.reduce((sum, item) => sum + item.totalEvents, 0), 2);
        assert.equal(blockedIPs.total, await BlockedIP.countDocuments({}));
        assert.equal(modelStatus.status, "RESULT_RECORDED");
        assert.equal(modelStatus.latestModelRun.model_type, modelType);
      });

      await t.test("GET /api/monitoring/metrics menyajikan field ModelRun aktual", async () => {
        const response = await fetch(`${baseUrl}/api/monitoring/metrics`);
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.status, "RESULT_RECORDED");
        assert.deepEqual(body.data, {
          model_type: modelType,
          accuracy: 0.91,
          precision: 0.92,
          recall: 0.93,
          f1_score: 0.925,
          roc_auc: 0.94,
        });

        const persisted = await ModelRun.findById(ownedModelRunId).lean().exec();
        assert.ok(persisted, "Record ModelRun fixture harus benar-benar tersimpan pada MongoDB.");
        assert.equal(persisted.model_type, modelType);
      });

      await t.test("GET /api/monitoring/traffic mengagregasi event aktual per jam", async () => {
        const query = new URLSearchParams({
          startDate: timeRange.startDate,
          endDate: timeRange.endDate,
          interval: "hour",
        });
        const response = await fetch(`${baseUrl}/api/monitoring/traffic?${query}`);
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.interval, "hour");
        assert.equal(body.data.data.length, 2);
        assert.equal(body.data.data.reduce((sum, item) => sum + item.totalEvents, 0), 2);
        assert.equal(body.data.data.reduce((sum, item) => sum + item.fraudCount, 0), 1);
        assert.equal(body.data.data.reduce((sum, item) => sum + item.validCount, 0), 1);
      });

      await t.test("GET /api/blocked-ips membaca dokumen aktual dengan pagination", async () => {
        const countBefore = await BlockedIP.countDocuments({ ip_address: { $lt: ownedBlockedIP } });
        const page = Math.floor(countBefore / PAGE_LIMIT) + 1;
        const response = await fetch(
          `${baseUrl}/api/blocked-ips?${new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) })}`
        );
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.total, await BlockedIP.countDocuments({}));
        assert.equal(body.page, page);
        assert.ok(
          body.data.some((item) => item.ip_address === ownedBlockedIP),
          "IP fixture harus dapat dibaca dari endpoint daftar blocked IP."
        );

        const persisted = await BlockedIP.findOne({ ip_address: ownedBlockedIP }).lean().exec();
        assert.ok(persisted, "IP fixture harus benar-benar tersimpan pada MongoDB.");
      });
    } catch (error) {
      if (error && error.name === "MongooseServerSelectionError") {
        error.message = `${error.message}\nPastikan MongoDB dapat diakses dan TEST_MONGODB_URI menunjuk ke database khusus bernama *_test atau *_testing.`;
      }
      throw error;
    } finally {
      try {
        if (server) await closeServer(server);
      } finally {
        if (mongoose.connection.readyState === 1) {
          try {
            // Targeted cleanup only: never drop collections or clear the entire database.
            await Event.deleteMany({ click_id: { $in: clickIds } }).exec();
            if (blockedIPInserted && ownedBlockedIP) {
              await BlockedIP.deleteOne({ ip_address: ownedBlockedIP }).exec();
            }
            if (modelRunInserted) {
              await ModelRun.deleteOne({ _id: ownedModelRunId }).exec();
            }
          } finally {
            await mongoose.disconnect();
          }
        }
      }
    }
  }
);
