"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createIngestionAuth } = require("../src/middleware/requireIngestionKey");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function requestWithKey(key) {
  return { get(name) { return name.toLowerCase() === "x-event-ingestion-key" ? key : undefined; } };
}

test("development allows local ingestion when no key has been configured", () => {
  const middleware = createIngestionAuth({ apiKey: "", nodeEnv: "development" });
  const response = responseRecorder();
  let nextCalled = false;
  middleware(requestWithKey(""), response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test("production fails closed when ingestion key is missing from configuration", () => {
  const middleware = createIngestionAuth({ apiKey: "", nodeEnv: "production" });
  const response = responseRecorder();
  let nextCalled = false;
  middleware(requestWithKey("secret"), response, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, "INGESTION_AUTH_NOT_CONFIGURED");
});

test("configured ingestion key accepts exact header and rejects missing or invalid values", () => {
  const middleware = createIngestionAuth({ apiKey: "collector-secret", nodeEnv: "production" });
  const acceptedResponse = responseRecorder();
  let nextCalled = false;
  middleware(requestWithKey("collector-secret"), acceptedResponse, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  for (const supplied of ["", "wrong", "collector-secret "]) {
    const response = responseRecorder();
    middleware(requestWithKey(supplied), response, () => assert.fail("next tidak boleh dipanggil"));
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error.code, "INVALID_INGESTION_KEY");
  }
});
