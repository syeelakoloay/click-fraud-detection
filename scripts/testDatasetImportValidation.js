"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseCsv } = require("../src/utils/csvParser");
const {
  isValidDatasetTimestamp,
  isValidHttpUrl,
  validateDatasetSemantics,
  validateIntegerFields,
} = require("../src/utils/datasetImportValidation");

function validPayload(overrides = {}) {
  return {
    timestamp: "2024-02-29 10:30:45",
    ip_address: "192.0.2.10",
    referrer_url: "https://example.test/referrer",
    page_url: "http://example.test/page",
    scroll_depth: 50,
    mouse_movement: 20,
    keystrokes_detected: 2,
    click_frequency: 1,
    time_since_last_click: 10,
    VPN_usage: 0,
    proxy_usage: 1,
    is_fraudulent: 0,
    ...overrides,
  };
}

test("dataset timestamp accepts the source format and supported ISO T separator", () => {
  assert.equal(isValidDatasetTimestamp("2024-02-29 10:30:45"), true);
  assert.equal(isValidDatasetTimestamp("2024-02-29T10:30:45.125"), true);
});

test("dataset timestamp rejects impossible dates and malformed values", () => {
  assert.equal(isValidDatasetTimestamp("2024-02-30 10:30:45"), false);
  assert.equal(isValidDatasetTimestamp("2023-02-29 10:30:45"), false);
  assert.equal(isValidDatasetTimestamp("2024-13-01 10:30:45"), false);
  assert.equal(isValidDatasetTimestamp("yesterday"), false);
});

test("HTTP URL validation accepts absolute HTTP and HTTPS URLs", () => {
  assert.equal(isValidHttpUrl("https://example.test/path?q=1"), true);
  assert.equal(isValidHttpUrl("http://example.test/"), true);
});

test("HTTP URL validation rejects unsupported schemes and invalid URLs", () => {
  assert.equal(isValidHttpUrl("javascript:alert(1)"), false);
  assert.equal(isValidHttpUrl("ftp://example.test/file"), false);
  assert.equal(isValidHttpUrl("example.test/path"), false);
  assert.equal(isValidHttpUrl("https://example.test/a b"), false);
});

test("dataset semantic validation accepts a valid IPv4/URL/timestamp payload", () => {
  assert.doesNotThrow(() => validateDatasetSemantics(validPayload()));
});

test("dataset semantic validation accepts valid IPv6 and rejects invalid IP addresses", () => {
  assert.doesNotThrow(() => validateDatasetSemantics(validPayload({ ip_address: "2001:db8::1" })));
  assert.throws(
    () => validateDatasetSemantics(validPayload({ ip_address: "999.0.0.1" })),
    { importCode: "INVALID_IP_ADDRESS" }
  );
});

test("integer semantic validation accepts integers across all designated fields", () => {
  assert.doesNotThrow(() => validateIntegerFields(validPayload()));
});

test("integer semantic validation rejects fractional values", () => {
  assert.throws(
    () => validateIntegerFields(validPayload({ mouse_movement: 2.5 })),
    { importCode: "INVALID_INTEGER_FIELD" }
  );
});

test("all 5,000 source dataset rows satisfy the import-specific semantic checks", () => {
  const datasetPath = path.join(__dirname, "..", "dataset", "click_fraud_dataset.csv");
  const records = parseCsv(fs.readFileSync(datasetPath, "utf8"));
  const headers = records[0];
  assert.equal(records.length - 1, 5000);

  for (let index = 1; index < records.length; index += 1) {
    const cells = records[index];
    assert.equal(cells.length, headers.length, `jumlah field salah pada baris CSV ${index + 1}`);
    const payload = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]));
    assert.doesNotThrow(() => validateDatasetSemantics(payload), `validasi semantik gagal pada baris CSV ${index + 1}`);
    const numbers = {
      scroll_depth: Number(payload.scroll_depth),
      mouse_movement: Number(payload.mouse_movement),
      keystrokes_detected: Number(payload.keystrokes_detected),
      click_frequency: Number(payload.click_frequency),
      time_since_last_click: Number(payload.time_since_last_click),
      VPN_usage: Number(payload.VPN_usage),
      proxy_usage: Number(payload.proxy_usage),
      is_fraudulent: Number(payload.is_fraudulent),
    };
    assert.doesNotThrow(() => validateIntegerFields(numbers), `validasi bilangan bulat gagal pada baris CSV ${index + 1}`);
  }
});
