
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

const sampleFeatures = {
  click_hour: 2,
  click_duration: 0.29,
  scroll_depth: 60,
  mouse_movement: 111,
  keystrokes_detected: 8,
  click_frequency: 7,
  time_since_last_click: 72,
  VPN_usage: 0,
  proxy_usage: 1,
  click_day_of_week: "Friday",
  device_type: "Tablet",
  browser: "Safari",
  operating_system: "Android",
  ad_position: "Bottom",
  device_ip_reputation: "Good",
};

async function withServer(predictionService, fn) {
  const app = createApp({
    services: { predictionService },
    allowedOrigins: ["http://localhost:5173"],
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("POST /api/predict meneruskan 15 fitur dan mengembalikan hasil prediksi", async () => {
  let receivedInput;

  const fakePredictionService = {
    async predict(input) {
      receivedInput = input;

      return {
        prediction: 0,
        classification: "Valid",
        probabilities: { Valid: 0.82, Fraud: 0.18 },
      };
    },
  };

  await withServer(fakePredictionService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleFeatures),
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(receivedInput, sampleFeatures);
    assert.equal(Object.keys(receivedInput).length, 15);
    assert.equal(body.prediction, 0);
    assert.equal(body.classification, "Valid");
    assert.equal(body.probabilities.Fraud, 0.18);
  });
});

test("POST /api/predict menolak body berupa array", async () => {
  const fakePredictionService = {
    async predict() {
      throw new Error("Layanan prediksi tidak seharusnya dipanggil.");
    },
  };

  await withServer(fakePredictionService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_INPUT");
  });
});

test("POST /api/predict meneruskan error layanan ML ke error handler", async () => {
  const fakePredictionService = {
    async predict() {
      const error = new Error(
        "Layanan ML tidak dapat dihubungi. Pastikan server Python berjalan."
      );
      error.status = 503;
      throw error;
    },
  };

  await withServer(fakePredictionService, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleFeatures),
    });

    assert.equal(response.status, 503);
  });
});
