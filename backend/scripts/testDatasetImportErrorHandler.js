"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { errorHandler } = require("../src/middleware/errorHandler");

function mockResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("import validation errors preserve their 4xx code and message", () => {
  const response = mockResponse();
  const error = new TypeError("Header CSV tidak sesuai.");
  error.status = 400;
  error.importCode = "INVALID_CSV_HEADER";

  errorHandler(error, {}, response, () => {});
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body.error, {
    code: "INVALID_CSV_HEADER",
    message: "Header CSV tidak sesuai.",
  });
});

test("persistence errors remain HTTP 503 and do not expose internal host details", () => {
  const response = mockResponse();
  const error = new Error("Penyimpanan dataset terganggu; periksa database sebelum mengulangi import.");
  error.status = 503;
  error.importCode = "IMPORT_PERSISTENCE_FAILED";
  error.cause = new Error("MongoServerSelectionError: private-db-host.example");

  errorHandler(error, {}, response, () => {});
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, "IMPORT_PERSISTENCE_FAILED");
  assert.equal(JSON.stringify(response.body).includes("private-db-host"), false);
});

test("body-too-large errors retain HTTP 413 handling", () => {
  const response = mockResponse();
  const error = new Error("request entity too large");
  error.status = 413;
  error.type = "entity.too.large";

  errorHandler(error, {}, response, () => {});
  assert.equal(response.statusCode, 413);
  assert.equal(response.body.error.code, "PAYLOAD_TOO_LARGE");
});

test("unclassified TypeError remains a client validation error", () => {
  const response = mockResponse();
  errorHandler(new TypeError("Permintaan tidak valid."), {}, response, () => {});
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});
