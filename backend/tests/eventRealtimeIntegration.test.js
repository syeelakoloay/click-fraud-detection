"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

const completeEvent = {
  click_id: "click-ingest-test",
  timestamp: "2026-11-23T10:00:00.000Z",
  user_id: "member-1",
  ip_address: "8.8.8.8",
  device_type: "Desktop",
  browser: "Chrome",
  operating_system: "Windows",
  click_duration: 2,
  scroll_depth: 30,
  mouse_movement: 10,
  keystrokes_detected: 1,
  ad_position: "Top",
  click_frequency: 1,
  time_since_last_click: 5,
  device_ip_reputation: "Good",
  VPN_usage: 0,
  proxy_usage: 0,
};

test("POST /api/events mempertahankan {data} dan menambahkan deteksi jika event mempunyai fitur model", async () => {
  let receivedEvent;
  const services = {
    eventService: {
      async createEvent(value) { receivedEvent = value; return { ...value, _id: "event-id" }; },
      async listEvents() { return { data: [], total: 0, page: 1, limit: 50, totalPages: 0 }; },
    },
    blockedIPService: { async syncHistoricalFraudIPs() { return {}; } },
    realtimePredictionService: {
      isPredictionReadyEvent: (value) => ["click_id", "ip_address", "timestamp", "click_duration", "scroll_depth", "mouse_movement", "keystrokes_detected", "click_frequency", "time_since_last_click", "VPN_usage", "proxy_usage", "device_type", "browser", "operating_system", "ad_position", "device_ip_reputation"].every((key) => value[key] !== undefined),
      async ingestAndPredict(value) {
        receivedEvent = value;
        return { data: { ...value, _id: "event-id" }, prediction: { label: 0, prediction_source: "model", prediction_status: "shadow_only" } };
      },
    },
    predictionService: { async predict() { return {}; }, async predictMartech() { return {}; } },
  };
  const app = createApp({ services, allowedOrigins: [] });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "ClickGuardTest/1.0" },
      body: JSON.stringify(completeEvent),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.data._id, "event-id");
    assert.equal(body.detection.prediction_status, "shadow_only");
    assert.equal(receivedEvent.user_agent, "ClickGuardTest/1.0");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
