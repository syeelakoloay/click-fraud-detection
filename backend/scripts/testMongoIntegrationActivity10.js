"use strict";

require("dotenv").config();

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const mongoose = require("mongoose");
const Event = require("../src/models/Event");
const { createApp } = require("../src/app");

const DEFAULT_TEST_MONGODB_URI =
  "mongodb://127.0.0.1:27017/click_fraud_detection_test";
const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || DEFAULT_TEST_MONGODB_URI;
const MAIN_MONGODB_URI = process.env.MONGODB_URI;

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

  // Safety guard: the integration test must only run against a database clearly
  // named for testing, and it must never target the same named DB as MONGODB_URI.
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

function makeEvent(clickId, overrides = {}) {
  return {
    click_id: clickId,
    timestamp: new Date().toISOString(),
    user_id: "activity10-integration-test-user",
    ip_address: "198.51.100.10",
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    referrer_url: "https://example.com/referrer",
    page_url: "https://example.com/test-page",
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
    is_fraudulent: 0,
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

test(
  "Integrasi API Aktivitas 10 dengan MongoDB aktual (database khusus pengujian)",
  { timeout: 30000 },
  async (t) => {
    const testDatabaseName = validateTestDatabaseUri();
    const prefix = `activity10-it-${process.pid}-${Date.now()}-${randomUUID()}`;
    const ownedClickIds = [`${prefix}-crud`, `${prefix}-batch`, `${prefix}-invalid`];
    let server;

    t.diagnostic(`Database pengujian: ${testDatabaseName}`);
    t.diagnostic("Tidak ada collection atau database utama yang dihapus oleh skrip ini.");

    try {
      await mongoose.connect(TEST_MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      assert.equal(mongoose.connection.readyState, 1, "Koneksi MongoDB pengujian harus aktif.");
      await Event.init();

      const { server: startedServer, baseUrl } = await listen(createApp());
      server = startedServer;
      t.diagnostic(`API uji berjalan sementara di ${baseUrl}`);

      await t.test("health check melaporkan MongoDB aktual tersambung", async () => {
        const response = await fetch(`${baseUrl}/health`);
        const body = await readJson(response);
        assert.equal(response.status, 200);
        assert.equal(body.status, "ok");
        assert.equal(body.database, "connected");
      });

      await t.test("POST menyimpan event dan data dapat ditemukan langsung di MongoDB", async () => {
        const clickId = ownedClickIds[0];
        const response = await fetch(`${baseUrl}/api/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(makeEvent(clickId)),
        });
        const body = await readJson(response);
        assert.equal(response.status, 201, JSON.stringify(body));
        assert.equal(body.data.click_id, clickId);

        const stored = await Event.findOne({ click_id: clickId }).lean().exec();
        assert.ok(stored, "Event hasil POST harus benar-benar tersimpan di MongoDB.");
        assert.equal(stored.user_id, "activity10-integration-test-user");
        assert.equal(stored.device_type, "Desktop");
      });

      await t.test("GET membaca event yang tersimpan di MongoDB", async () => {
        const clickId = ownedClickIds[0];
        const response = await fetch(`${baseUrl}/api/events/${encodeURIComponent(clickId)}`);
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.click_id, clickId);

        const stored = await Event.findOne({ click_id: clickId }).lean().exec();
        assert.ok(stored, "Event harus tetap ada di MongoDB setelah dibaca melalui API.");
      });

      await t.test("PATCH memperbarui event pada MongoDB aktual", async () => {
        const clickId = ownedClickIds[0];
        const response = await fetch(`${baseUrl}/api/events/${encodeURIComponent(clickId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ click_duration: 12.5, scroll_depth: 72 }),
        });
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.click_duration, 12.5);
        assert.equal(body.data.scroll_depth, 72);

        const stored = await Event.findOne({ click_id: clickId }).lean().exec();
        assert.equal(stored.click_duration, 12.5);
        assert.equal(stored.scroll_depth, 72);
      });

      await t.test("batch ingestion menyimpan item valid dan menolak item tidak valid", async () => {
        const validClickId = ownedClickIds[1];
        const invalidClickId = ownedClickIds[2];
        const response = await fetch(`${baseUrl}/api/events/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: [makeEvent(validClickId), { click_id: invalidClickId }],
          }),
        });
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.receivedCount, 2);
        assert.equal(body.successCount, 1);
        assert.equal(body.failureCount, 1);

        const storedValid = await Event.findOne({ click_id: validClickId }).lean().exec();
        const storedInvalid = await Event.findOne({ click_id: invalidClickId }).lean().exec();
        assert.ok(storedValid, "Item batch yang valid harus tersimpan pada MongoDB.");
        assert.equal(storedInvalid, null, "Item batch yang tidak valid tidak boleh tersimpan.");
      });

      await t.test("DELETE menghapus event dari MongoDB aktual", async () => {
        const clickId = ownedClickIds[0];
        const response = await fetch(`${baseUrl}/api/events/${encodeURIComponent(clickId)}`, {
          method: "DELETE",
        });
        const body = await readJson(response);
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.click_id, clickId);

        const stored = await Event.findOne({ click_id: clickId }).lean().exec();
        assert.equal(stored, null, "Event harus sudah tidak ada di MongoDB setelah DELETE.");
      });
    } finally {
      try {
        if (server) await closeServer(server);
      } finally {
        if (mongoose.connection.readyState === 1) {
          try {
            // Delete only records created by this run, never the entire test database.
            await Event.deleteMany({ click_id: { $in: ownedClickIds } }).exec();
          } finally {
            await mongoose.disconnect();
          }
        }
      }
    }
  }
);
