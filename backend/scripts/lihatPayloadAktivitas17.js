const { buildPayload } = require("../src/services/realtimePredictionService");

const event = {
  click_id: "UJI-002",
  ip_address: "10.10.10.2",
  timestamp: "2026-10-22T10:06:00Z",
  device_type: "Desktop",
  browser: "Chrome",
  operating_system: "Windows",
  ad_position: "Top",
  click_duration: 2.5,
  scroll_depth: 40,
  mouse_movement: 120,
  keystrokes_detected: 3,
  click_frequency: 1,
  time_since_last_click: 30,
  device_ip_reputation: "Good",
  VPN_usage: 0,
  proxy_usage: 0,
};
const ringkasan = {
  window_minutes: 10,
  history_click_count: 3,
  history_fraud_count: 1,
  history_seconds_since_last: 60,
};
console.log(JSON.stringify(buildPayload(event, ringkasan), null, 2));
