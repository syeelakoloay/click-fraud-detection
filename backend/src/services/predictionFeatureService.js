
"use strict";

const FEATURE_COLUMNS = [
  "click_hour",
  "click_duration",
  "scroll_depth",
  "mouse_movement",
  "keystrokes_detected",
  "click_frequency",
  "time_since_last_click",
  "VPN_usage",
  "proxy_usage",
  "click_day_of_week",
  "device_type",
  "browser",
  "operating_system",
  "ad_position",
  "device_ip_reputation",
];

function preparePredictionFeatures(eventData) {
  if (
    !eventData ||
    typeof eventData !== "object" ||
    Array.isArray(eventData)
  ) {
    throw new TypeError("Data event harus berupa object.");
  }

  const timestamp = new Date(eventData.timestamp);

  if (
    eventData.timestamp === undefined ||
    eventData.timestamp === null ||
    eventData.timestamp === "" ||
    Number.isNaN(timestamp.getTime())
  ) {
    throw new TypeError("timestamp harus berupa tanggal yang valid.");
  }

  const features = {
    click_hour: timestamp.getHours(),
    click_duration: eventData.click_duration,
    scroll_depth: eventData.scroll_depth,
    mouse_movement: eventData.mouse_movement,
    keystrokes_detected: eventData.keystrokes_detected,
    click_frequency: eventData.click_frequency,
    time_since_last_click: eventData.time_since_last_click,
    VPN_usage: eventData.VPN_usage,
    proxy_usage: eventData.proxy_usage,
    click_day_of_week: timestamp.toLocaleDateString("en-US", {
weekday: "long",
    }),
    device_type: eventData.device_type,
    browser: eventData.browser,
    operating_system: eventData.operating_system,
    ad_position: eventData.ad_position,
    device_ip_reputation: eventData.device_ip_reputation,
  };

  const missingFeatures = FEATURE_COLUMNS.filter(
    (name) =>
      features[name] === undefined ||
      features[name] === null ||
      features[name] === ""
  );

  if (missingFeatures.length > 0) {
    const error = new TypeError(
      "Data event belum memiliki semua fitur yang diperlukan."
    );
    error.details = { missing_features: missingFeatures };
    throw error;
  }

  return Object.fromEntries(
    FEATURE_COLUMNS.map((name) => [name, features[name]])
  );
}

module.exports = {
  FEATURE_COLUMNS,
  preparePredictionFeatures,
};
