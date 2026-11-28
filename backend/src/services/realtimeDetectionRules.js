"use strict";

const net = require("node:net");

const REALTIME_MODEL_RAW_FIELDS = [
  "click_duration", "scroll_depth", "mouse_movement", "keystrokes_detected",
  "click_frequency", "time_since_last_click", "VPN_usage", "proxy_usage",
  "device_type", "browser", "operating_system", "ad_position", "device_ip_reputation",
];

function validateRealtimeEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Event harus berupa object.");
  }
  const required = ["click_id", "ip_address", "timestamp", ...REALTIME_MODEL_RAW_FIELDS];
  for (const field of required) {
    if (event[field] === undefined || event[field] === null || event[field] === "") {
      throw new TypeError(`Field ${field} wajib diisi.`);
    }
  }
  if (net.isIP(String(event.ip_address)) === 0) {
    throw new TypeError("ip_address harus berupa alamat IP yang valid.");
  }
  if (Number.isNaN(new Date(event.timestamp).getTime())) {
    throw new TypeError("timestamp bukan tanggal yang valid.");
  }
  if (event.user_agent !== undefined && String(event.user_agent).length > 512) {
    throw new TypeError("user_agent maksimal 512 karakter.");
  }
  if (event.campaign_id !== undefined && event.campaign_id !== null && !/^\d{1,20}$/.test(String(event.campaign_id))) {
    throw new TypeError("campaign_id harus berupa angka 1-20 digit.");
  }
  return true;
}

function readPositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function isRoutablePublicIPv4(value) {
  if (net.isIP(value) !== 4) return false;
  const [a, b, c] = value.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPredictionReadyEvent(event) {
  const fields = [
    "click_id", "ip_address", "timestamp", "click_duration", "scroll_depth",
    "mouse_movement", "keystrokes_detected", "click_frequency", "time_since_last_click",
    "VPN_usage", "proxy_usage", "device_type", "browser", "operating_system",
    "ad_position", "device_ip_reputation",
  ];
  return Boolean(event && typeof event === "object" && !Array.isArray(event)
    && fields.every((field) => event[field] !== undefined && event[field] !== null && event[field] !== ""));
}

function getEventReceivedTime(event) {
  return event?.received_at ?? event?.timestamp;
}

function isActiveBlockRecord(record) {
  return Boolean(record && record.source !== "historical_dataset_label");
}

function evaluateBurstRisk(event, history, env = process.env) {
  const windowSeconds = readPositiveInteger(env.REALTIME_IP_BURST_WINDOW_SECONDS, 5);
  const identifiedLimit = readPositiveInteger(env.REALTIME_IP_BURST_LIMIT_IDENTIFIED, 10);
  const anonymousLimit = readPositiveInteger(env.REALTIME_IP_BURST_LIMIT_ANONYMOUS, 20);
  const eventTime = new Date(getEventReceivedTime(event)).getTime();
  const windowStart = eventTime - windowSeconds * 1000;
  const recent = [...history, event].filter((item) => {
    const timestamp = new Date(getEventReceivedTime(item)).getTime();
    return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp <= eventTime;
  });
  const userId = String(event.user_id || "anonymous").trim();
  const userAgent = String(event.user_agent || "").trim();
  const identified = userId && userId.toLowerCase() !== "anonymous";

  if (identified && userAgent) {
    const matching = recent.filter((item) => String(item.user_id || "anonymous").trim() === userId
      && String(item.user_agent || "").trim() === userAgent);
    if (matching.length >= identifiedLimit) {
      return { triggered: true, reason: "identified_user_same_user_agent_click_burst", clickCount: matching.length, windowSeconds, threshold: identifiedLimit };
    }
    return { triggered: false, reason: null, clickCount: matching.length, windowSeconds, threshold: identifiedLimit };
  }

  const highRiskNetwork = Number(event.VPN_usage) === 1
    || Number(event.proxy_usage) === 1
    || String(event.device_ip_reputation).toLowerCase() === "bad";
  if (!identified && userAgent && highRiskNetwork) {
    const matching = recent.filter((item) => String(item.user_agent || "").trim() === userAgent);
    if (matching.length >= anonymousLimit) {
      return { triggered: true, reason: "anonymous_high_risk_network_click_burst", clickCount: matching.length, windowSeconds, threshold: anonymousLimit };
    }
    return { triggered: false, reason: null, clickCount: matching.length, windowSeconds, threshold: anonymousLimit };
  }

  return {
    triggered: false,
    reason: null,
    clickCount: recent.length,
    windowSeconds,
    threshold: identified ? identifiedLimit : anonymousLimit,
    note: "Burst tidak memblokir tanpa identitas/UA yang konsisten atau indikator jaringan berisiko.",
  };
}

module.exports = {
  readPositiveInteger,
  isRoutablePublicIPv4,
  isPredictionReadyEvent,
  getEventReceivedTime,
  isActiveBlockRecord,
  evaluateBurstRisk,
  validateRealtimeEvent,
};
