
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FEATURE_COLUMNS,
  preparePredictionFeatures,
} = require("../src/services/predictionFeatureService");

const sampleEvent = {
  timestamp: "2025-01-30 23:23:50",
  click_duration: 12,
  scroll_depth: 75,
  mouse_movement: 150,
  keystrokes_detected: 8,
  click_frequency: 3,
  time_since_last_click: 20,
  VPN_usage: 0,
  proxy_usage: 0,
  device_type: "Desktop",
  browser: "Chrome",
  operating_system: "Windows",
  ad_position: "Top",
  device_ip_reputation: "Good",
};

test("menyiapkan 15 fitur dari data event", () => {
  const features = preparePredictionFeatures(sampleEvent);

  assert.equal(FEATURE_COLUMNS.length, 15);
  assert.deepEqual(Object.keys(features), FEATURE_COLUMNS);

  assert.equal(
    features.click_hour,
    new Date(sampleEvent.timestamp).getHours()
  );

  assert.equal(features.click_day_of_week, "Thursday");
  assert.equal(features.click_duration, 12);
  assert.equal(features.device_type, "Desktop");
});

test("menolak timestamp yang tidak valid", () => {
  assert.throws(
    () =>
      preparePredictionFeatures({
        ...sampleEvent,
        timestamp: "bukan-tanggal",
      }),
    /timestamp harus berupa tanggal yang valid/
  );
});

test("menolak event dengan fitur yang belum lengkap", () => {
  assert.throws(
    () =>
      preparePredictionFeatures({
        ...sampleEvent,
        browser: "",
      }),
    (error) => {
      assert.deepEqual(error.details.missing_features, ["browser"]);
      return true;
    }
  );
});

test("menolak input yang bukan object event", () => {
  assert.throws(
    () => preparePredictionFeatures([]),
    /Data event harus berupa object/
  );
});
