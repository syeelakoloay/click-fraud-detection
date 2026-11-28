"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

function makeEvent(overrides = {}) {
  return {
    click_id: "evt-api-test-001",
    timestamp: "2024-08-18T10:30:00.000Z",
    user_id: "user-test-001",
    ip_address: "192.0.2.10",
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    referrer_url: "https://example.test/referrer",
    page_url: "https://example.test/landing",
    click_duration: 2.1,
    scroll_depth: 40,
    mouse_movement: 12,
    keystrokes_detected: 2,
    ad_position: "Top",
    click_frequency: 1,
    time_since_last_click: 10,
    device_ip_reputation: "Good",
    VPN_usage: 0,
    proxy_usage: 0,
    bot_likelihood_score: 0.2,
    is_fraudulent: 0,
    ...overrides,
  };
}

function createFakeServices() {
  const records = new Map();
  const plain = (record) => ({ ...record });
  return {
    records,
    eventService: {
      async createEvent(data) {
        if (records.has(data.click_id)) {
          const error = new Error("duplicate key");
          error.code = 11000;
          throw error;
        }
        if (!data.click_id || !data.timestamp || !data.is_fraudulent && data.is_fraudulent !== 0) {
          const error = new Error("Data event tidak valid.");
          error.name = "ValidationError";
          throw error;
        }
        const result = plain(data);
        records.set(data.click_id, result);
        return result;
      },
      async listEvents(options = {}) {
        const all = Array.from(records.values());
        const page = Number(options.page || 1);
        const limit = Number(options.limit || 50);
        const data = all.slice((page - 1) * limit, page * limit);
        return { data, total: all.length, page, limit, totalPages: Math.ceil(all.length / limit) };
      },
      async getEventByClickId(clickId) {
        return records.has(clickId) ? plain(records.get(clickId)) : null;
      },
      async updateEventByClickId(clickId, data) {
        if (!records.has(clickId)) return null;
        const result = { ...records.get(clickId), ...data };
        records.set(clickId, result);
        return plain(result);
      },
      async deleteEventByClickId(clickId) {
        if (!records.has(clickId)) return null;
        const result = plain(records.get(clickId));
        records.delete(clickId);
        return result;
      },
    },
  };
}

async function withServer(fn, options = {}) {
  const app = createApp({
    services: options.services,
    allowedOrigins: options.allowedOrigins || ["http://localhost:5173"],
    getDatabaseState: options.getDatabaseState || (() => 1),
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("GET /health melaporkan status aplikasi dan database", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.database, "connected");
  });
});

test("GET /health mengembalikan 503 saat database terputus", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, "degraded");
    assert.equal(body.database, "disconnected");
  }, { getDatabaseState: () => 0 });
});

test("CORS memperbolehkan origin yang dikonfigurasi dan menolak origin lain", async () => {
  await withServer(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: "http://localhost:5173" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const denied = await fetch(`${baseUrl}/health`, { headers: { Origin: "https://unexpected.example" } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, "CORS_ORIGIN_NOT_ALLOWED");
  });
});

test("preflight OPTIONS mengizinkan metode CRUD yang dikonfigurasi", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/test-id`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.match(response.headers.get("access-control-allow-methods") || "", /PATCH/);
  });
});

test("POST dan GET event menggunakan click_id", async () => {
  const fake = createFakeServices();
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeEvent()),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.click_id, "evt-api-test-001");

    const retrieved = await fetch(`${baseUrl}/api/events/evt-api-test-001`);
    assert.equal(retrieved.status, 200);
    assert.equal((await retrieved.json()).data.ip_address, "192.0.2.10");
  }, { services: fake });
});

test("PATCH tidak mengizinkan perubahan click_id; DELETE event dapat dilakukan", async () => {
  const fake = createFakeServices();
  fake.records.set("evt-api-test-001", makeEvent());
  await withServer(async (baseUrl) => {
    const rejected = await fetch(`${baseUrl}/api/events/evt-api-test-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ click_id: "new-id" }),
    });
    assert.equal(rejected.status, 400);

    const updated = await fetch(`${baseUrl}/api/events/evt-api-test-001`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scroll_depth: 55 }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.scroll_depth, 55);

    const deleted = await fetch(`${baseUrl}/api/events/evt-api-test-001`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json()).message, "Event berhasil dihapus.");
  }, { services: fake });
});

test("POST /api/events/ingest melaporkan event diterima dan ditolak", async () => {
  const fake = createFakeServices();
  fake.records.set("duplicate-id", makeEvent({ click_id: "duplicate-id" }));
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [
        makeEvent({ click_id: "batch-good-1" }),
        makeEvent({ click_id: "duplicate-id" }),
        { click_id: "bad-extra-field", unexpected: true },
      ] }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.receivedCount, 3);
    assert.equal(body.successCount, 1);
    assert.equal(body.failureCount, 2);
  }, { services: fake });
});

test("Field tidak dikenal dan JSON tidak valid ditangani secara konsisten", async () => {
  await withServer(async (baseUrl) => {
    const unknown = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...makeEvent(), invented_field: "not allowed" }),
    });
    assert.equal(unknown.status, 400);

    const malformed = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "INVALID_JSON");
  });
});
