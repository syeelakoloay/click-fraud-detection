"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createBlockedIPController = require("../src/controllers/blockedIPController");

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("GET blocked IP meneruskan pagination dan mempertahankan metadata service", async () => {
  let receivedOptions;
  const result = {
    data: [{ ip_address: "192.0.2.10" }],
    total: 1,
    page: 2,
    limit: 10,
    totalPages: 1,
  };
  const controller = createBlockedIPController({
    async listBlockedIPs(options) { receivedOptions = options; return result; },
  });
  const res = responseRecorder();

  await controller.listBlockedIPs({ query: { page: "2", limit: "10" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(receivedOptions, { page: "2", limit: "10" });
  assert.deepEqual(res.body, result);
});

test("error service diteruskan ke middleware error", async () => {
  const serviceError = new Error("database unavailable");
  let forwardedError;
  const controller = createBlockedIPController({
    async listBlockedIPs() { throw serviceError; },
  });

  await controller.listBlockedIPs({ query: {} }, responseRecorder(), (error) => { forwardedError = error; });

  assert.equal(forwardedError, serviceError);
});
