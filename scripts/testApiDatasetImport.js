"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../src/app");

const HEADERS = [
  "click_id", "timestamp", "user_id", "ip_address", "device_type", "browser",
  "operating_system", "referrer_url", "page_url", "click_duration", "scroll_depth",
  "mouse_movement", "keystrokes_detected", "ad_position", "click_frequency",
  "time_since_last_click", "device_ip_reputation", "VPN_usage", "proxy_usage",
  "bot_likelihood_score", "is_fraudulent",
];

function validRow(overrides = {}) {
  return {
    click_id: "click-test-001",
    timestamp: "2024-02-20 10:00:00",
    user_id: "user-test-001",
    ip_address: "192.0.2.10",
    device_type: "Desktop",
    browser: "Chrome",
    operating_system: "Windows",
    referrer_url: "https://example.test/referrer",
    page_url: "https://example.test/ad",
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

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvFor(rows, headers = HEADERS) {
  return [headers, ...rows]
    .map((row) => {
      const values = Array.isArray(row) ? row : headers.map((header) => row[header] ?? "");
      return values.map(csvEscape).join(",");
    })
    .join("\r\n") + "\r\n";
}

function makeFakeServices() {
  const saved = [];
  const eventService = {
    async createEvent(eventData) {
      saved.push(eventData);
      return eventData;
    },
  };
  return { eventService, saved };
}

async function withApi(run, options = {}) {
  const fake = makeFakeServices();
  const eventService = options.eventService || fake.eventService;
  const app = createApp({
    services: { eventService },
    getDatabaseState: () => 1,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`, fake);
  } finally {
    const closed = once(server, "close");
    server.close();
    await closed;
  }
}

test("POST /api/events/import validates, casts, and imports a valid CSV record", async () => {
  await withApi(async (baseUrl, fake) => {
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor([validRow()]),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.receivedCount, 1);
    assert.equal(body.successCount, 1);
    assert.equal(body.failureCount, 0);
    assert.equal(fake.saved.length, 1);
    assert.equal(typeof fake.saved[0].click_duration, "number");
    assert.equal(typeof fake.saved[0].is_fraudulent, "number");
    assert.ok(fake.saved[0].timestamp instanceof Date);
    assert.equal(body.results[0].status, "created");
    assert.equal(body.results[0].rowNumber, 2);
    assert.equal(Object.hasOwn(body.results[0], "index"), false, "Respons tidak perlu mengulang indeks internal.");
    assert.equal(Object.hasOwn(body.results[0], "data"), false, "Respons sukses tidak mengembalikan seluruh dokumen event.");
  });
});

test("invalid event rows are rejected while valid rows still import", async () => {
  await withApi(async (baseUrl, fake) => {
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor([
        validRow({ click_id: "click-test-001" }),
        validRow({ click_id: "click-test-002", device_type: "Phone" }),
        validRow({ click_id: "click-test-003" }),
      ]),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.receivedCount, 3);
    assert.equal(body.successCount, 2);
    assert.equal(body.failureCount, 1);
    assert.equal(fake.saved.length, 2);
    assert.equal(body.results[1].status, "rejected");
    assert.equal(body.results[1].error.code, "INVALID_EVENT");
  });
});

test("header mismatch is rejected before any record is saved", async () => {
  await withApi(async (baseUrl, fake) => {
    const incompleteHeaders = HEADERS.filter((header) => header !== "proxy_usage");
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor([validRow()], incompleteHeaders),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_CSV_HEADER");
    assert.equal(fake.saved.length, 0);
  });
});

test("malformed CSV is rejected before any record is saved", async () => {
  await withApi(async (baseUrl, fake) => {
    const malformed = `${HEADERS.join(",")}\n${HEADERS.map((_, i) => (i === 0 ? '"unterminated' : "x")).join(",")}`;
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: malformed,
    });

    assert.equal(response.status, 400);
    assert.equal(fake.saved.length, 0);
  });
});

test("a row with the wrong number of fields is rejected independently", async () => {
  await withApi(async (baseUrl, fake) => {
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor([["short", "row"], validRow({ click_id: "click-test-valid" })]),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.receivedCount, 2);
    assert.equal(body.successCount, 1);
    assert.equal(body.failureCount, 1);
    assert.equal(body.results[0].error.code, "CSV_ROW_WIDTH_MISMATCH");
    assert.equal(fake.saved.length, 1);
  });
});

test("JSON content type is not accepted by the CSV import route", async () => {
  await withApi(async (baseUrl, fake) => {
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_CONTENT_TYPE");
    assert.equal(fake.saved.length, 0);
  });
});

test("CSV semantic validation rejects invalid timestamp, IP, URL, and integer values before persistence", async () => {
  await withApi(async (baseUrl, fake) => {
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor([
        validRow({ click_id: "invalid-timestamp", timestamp: "2024-02-30 10:00:00" }),
        validRow({ click_id: "invalid-ip", ip_address: "999.10.1.1" }),
        validRow({ click_id: "invalid-url", page_url: "javascript:alert(1)" }),
        validRow({ click_id: "invalid-integer", mouse_movement: "2.5" }),
      ]),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.receivedCount, 4);
    assert.equal(body.successCount, 0);
    assert.equal(body.failureCount, 4);
    assert.deepEqual(body.results.map((item) => item.error.code), [
      "INVALID_TIMESTAMP", "INVALID_IP_ADDRESS", "INVALID_URL", "INVALID_INTEGER_FIELD",
    ]);
    assert.equal(fake.saved.length, 0, "Data yang gagal validasi tidak boleh diteruskan ke service.");
  });
});

test("database persistence failure returns 503 instead of a successful import summary", async () => {
  const eventService = {
    async createEvent() {
      const error = new Error("MongoServerSelectionError: private-db-host.example");
      error.name = "MongoServerSelectionError";
      throw error;
    },
  };

  await withApi(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor([validRow({ click_id: "db-failure-001" })]),
    });
    const body = await response.json();
    const responseText = JSON.stringify(body);

    assert.equal(response.status, 503);
    assert.equal(body.error.code, "IMPORT_PERSISTENCE_FAILED");
    assert.equal(Object.hasOwn(body, "successCount"), false);
    assert.equal(responseText.includes("private-db-host"), false, "Detail internal database tidak boleh dibocorkan ke klien.");
  }, { eventService });
});

test("CSV import rejects more than 5000 data records before saving", async () => {
  await withApi(async (baseUrl, fake) => {
    const rows = Array.from({ length: 5001 }, (_, index) => validRow({ click_id: `click-${index}` }));
    const response = await fetch(`${baseUrl}/api/events/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: csvFor(rows),
    });

    assert.equal(response.status, 400);
    assert.equal(fake.saved.length, 0);
  });
});
