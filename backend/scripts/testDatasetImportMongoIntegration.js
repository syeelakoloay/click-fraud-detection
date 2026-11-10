"use strict";

require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const mongoose = require("mongoose");
const Event = require("../src/models/Event");
const { createApp } = require("../src/app");

const DEFAULT_TEST_MONGODB_URI =
  "mongodb://127.0.0.1:27017/click_fraud_activity15_test";
const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || DEFAULT_TEST_MONGODB_URI;
const MAIN_MONGODB_URI = process.env.MONGODB_URI;

const HEADERS = [
  "click_id",
  "timestamp",
  "user_id",
  "ip_address",
  "device_type",
  "browser",
  "operating_system",
  "referrer_url",
  "page_url",
  "click_duration",
  "scroll_depth",
  "mouse_movement",
  "keystrokes_detected",
  "ad_position",
  "click_frequency",
  "time_since_last_click",
  "device_ip_reputation",
  "VPN_usage",
  "proxy_usage",
  "bot_likelihood_score",
  "is_fraudulent",
];

function databaseName(uri, variableName) {
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

function validateTestDatabase() {
  const testDbName = databaseName(TEST_MONGODB_URI, "TEST_MONGODB_URI");
  if (!/_test(?:ing)?$/i.test(testDbName)) {
    throw new Error(
      `Pengujian dibatalkan: database uji harus berakhiran _test atau _testing (saat ini: "${testDbName || "(kosong)"}").`
    );
  }
  if (MAIN_MONGODB_URI) {
    const mainDbName = databaseName(MAIN_MONGODB_URI, "MONGODB_URI");
    if (mainDbName && mainDbName === testDbName) {
      throw new Error(
        "Pengujian dibatalkan: TEST_MONGODB_URI menunjuk ke database yang sama dengan MONGODB_URI. Gunakan database uji terpisah."
      );
    }
  }
  return testDbName;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, headers = HEADERS) {
  return [headers, ...rows]
    .map((row) => {
      const values = Array.isArray(row) ? row : headers.map((header) => row[header] ?? "");
      return values.map(csvEscape).join(",");
    })
    .join("\r\n") + "\r\n";
}

function validRow(clickId, token, overrides = {}) {
  return {
    click_id: clickId,
    timestamp: "2024-02-20 10:00:00",
    user_id: `activity15-it-user-${token}`,
    ip_address: "192.0.2.10",
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    referrer_url: "https://example.test/activity15-referrer",
    page_url: "https://example.test/activity15-page",
    click_duration: "2.5",
    scroll_depth: "50",
    mouse_movement: "20",
    keystrokes_detected: "2",
    ad_position: "Top",
    click_frequency: "1",
    time_since_last_click: "10",
    device_ip_reputation: "Good",
    VPN_usage: "0",
    proxy_usage: "0",
    bot_likelihood_score: "0.25",
    is_fraudulent: "0",
    ...overrides,
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(`Respons bukan JSON yang valid (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
}

async function startTestServer(app) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function closeTestServer(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test(
  "Aktivitas 15: endpoint import CSV terintegrasi dengan Express, service asli, Mongoose, dan MongoDB aktual",
  { timeout: 60000 },
  async (t) => {
    const dbName = validateTestDatabase();
    const token = randomUUID();
    const ids = {
      validA: `activity15-it-${token}-valid-a`,
      invalid: `activity15-it-${token}-invalid`,
      validB: `activity15-it-${token}-valid-b`,
      header: `activity15-it-${token}-header`,
    };
    const ownedIds = Object.values(ids);
    let server;
    let connected = false;

    t.diagnostic(`Database pengujian aktual: ${dbName}`);
    t.diagnostic("Suite memakai Express, eventService, Mongoose, dan MongoDB aktual; tidak memakai mock service.");
    t.diagnostic("Pembersihan hanya menargetkan click_id unik yang dibuat oleh eksekusi ini; database tidak dihapus.");

    try {
      await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      connected = true;
      assert.equal(mongoose.connection.readyState, 1, "Koneksi MongoDB aktual harus aktif.");
      await Event.init();

      const started = await startTestServer(createApp());
      server = started.server;
      const baseUrl = started.baseUrl;
      t.diagnostic(`Express test server: ${baseUrl}`);

      await t.test("import menolak record tidak valid dan menyimpan record valid ke MongoDB", async () => {
        const rows = [
          validRow(ids.validA, token),
          validRow(ids.invalid, token, { device_type: "Phone" }),
          validRow(ids.validB, token, { browser: "Firefox", is_fraudulent: "1" }),
        ];
        const response = await fetch(`${baseUrl}/api/events/import`, {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: toCsv(rows),
        });
        const body = await readJson(response);

        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.receivedCount, 3);
        assert.equal(body.successCount, 2);
        assert.equal(body.failureCount, 1);
        assert.deepEqual(body.results.map((item) => item.status), ["created", "rejected", "created"]);
        assert.equal(body.results[1].error.code, "INVALID_EVENT");
        assert.equal(Object.hasOwn(body.results[0], "data"), false, "Respons import tidak mengembalikan dokumen event lengkap.");
        assert.equal(Object.hasOwn(body.results[0], "index"), false, "Respons import tidak mengembalikan indeks internal.");

        const [savedA, savedInvalid, savedB] = await Promise.all([
          Event.findOne({ click_id: ids.validA }).lean().exec(),
          Event.findOne({ click_id: ids.invalid }).lean().exec(),
          Event.findOne({ click_id: ids.validB }).lean().exec(),
        ]);
        assert.ok(savedA, "Record valid A harus benar-benar tersimpan di MongoDB.");
        assert.equal(savedA.click_duration, 2.5, "Nilai numerik harus di-cast melalui schema Mongoose.");
        assert.ok(savedB, "Record valid B harus benar-benar tersimpan di MongoDB.");
        assert.equal(savedB.is_fraudulent, 1);
        assert.equal(savedInvalid, null, "Record invalid tidak boleh tersimpan ke MongoDB.");
      });

      await t.test("record valid dapat dibaca lewat API dan record invalid menghasilkan 404", async () => {
        for (const clickId of [ids.validA, ids.validB]) {
          const response = await fetch(`${baseUrl}/api/events/${encodeURIComponent(clickId)}`);
          const body = await readJson(response);
          assert.equal(response.status, 200, JSON.stringify(body));
          assert.equal(body.data.click_id, clickId);
        }

        const response = await fetch(`${baseUrl}/api/events/${encodeURIComponent(ids.invalid)}`);
        const body = await readJson(response);
        assert.equal(response.status, 404);
        assert.equal(body.error.code, "EVENT_NOT_FOUND");
      });

      await t.test("header tidak sesuai ditolak sebelum record tersimpan", async () => {
        const incompleteHeaders = HEADERS.filter((header) => header !== "proxy_usage");
        const row = validRow(ids.header, token);
        const response = await fetch(`${baseUrl}/api/events/import`, {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: toCsv([row], incompleteHeaders),
        });
        const body = await readJson(response);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(await Event.exists({ click_id: ids.header }), null);
      });

      await t.test("CSV rusak ditolak tanpa menyimpan record", async () => {
        const malformed = `${HEADERS.join(",")}\r\n"unterminated,${HEADERS.slice(1).map(() => "x").join(",")}\r\n`;
        const response = await fetch(`${baseUrl}/api/events/import`, {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: malformed,
        });
        assert.equal(response.status, 400);
        assert.equal(await Event.countDocuments({ click_id: { $in: ownedIds } }), 2);
      });
    } finally {
      await closeTestServer(server).catch((error) => {
        t.diagnostic(`Peringatan saat menutup server tes: ${error.message}`);
      });
      if (connected && mongoose.connection.readyState === 1) {
        // These click IDs are unique to this run; never drop a collection or database.
        await Event.deleteMany({ click_id: { $in: ownedIds } }).catch((error) => {
          t.diagnostic(`Peringatan pembersihan record tes: ${error.message}`);
        });
        await mongoose.disconnect().catch((error) => {
          t.diagnostic(`Peringatan saat menutup koneksi MongoDB: ${error.message}`);
        });
      }
    }
  }
);
