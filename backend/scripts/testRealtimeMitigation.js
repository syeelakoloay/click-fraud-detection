"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const API_BASE_URL = String(process.env.API_BASE_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const TEST_IP = process.env.TEST_IP || `203.0.113.${10 + Math.floor(Math.random() * 200)}`;
const RUN_ID = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const CLICK_COUNT = 10;
const INGESTION_API_KEY = String(process.env.EVENT_INGESTION_API_KEY || "").trim();

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options?.method || "GET"} ${url} gagal (${response.status}): ${payload?.error?.message || "respons tidak valid"}`);
  }
  return payload;
}

async function main() {
  console.log(`Mengirim ${CLICK_COUNT} event uji ke ${API_BASE_URL}`);
  console.log(`Autentikasi ingestion: ${INGESTION_API_KEY ? "key configured" : "development/no key"}`);
  console.log(`IP uji ${TEST_IP} adalah alamat dokumentasi (bukan IP publik yang dapat dikecualikan di Google Ads).`);

  const requests = Array.from({ length: CLICK_COUNT }, (_, index) => {
    const clickId = `CLICKGUARD-TEST-${RUN_ID}-${index + 1}`;
    const body = {
      click_id: clickId,
      ip_address: TEST_IP,
      timestamp: new Date(Date.now() - index * 60_000).toISOString(),
      user_id: `clickguard-test-${RUN_ID}`,
      user_agent: `ClickGuard-Realtime-Test/${RUN_ID}`,
      campaign_id: undefined,
      click_duration: 1,
      scroll_depth: 8,
      mouse_movement: 3,
      keystrokes_detected: 0,
      click_frequency: index + 1,
      time_since_last_click: 1,
      VPN_usage: 0,
      proxy_usage: 0,
      device_type: "Desktop",
      browser: "Chrome",
      operating_system: "Windows",
      ad_position: "Top",
      device_ip_reputation: "Good",
    };
    return requestJson(`${API_BASE_URL}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": body.user_agent,
        ...(INGESTION_API_KEY ? { "X-Event-Ingestion-Key": INGESTION_API_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    }).then((payload) => ({ clickId, detection: payload.detection || null }));
  });

  const results = await Promise.all(requests);
  const triggered = results.find((item) => item.detection?.prediction_source === "behavioral_rule"
    && item.detection?.detection_reason === "identified_user_same_user_agent_click_burst");
  if (!triggered) {
    throw new Error("Rule burst tidak terpicu. Pastikan 10 event diterima dalam jendela 5 detik, MongoDB terhubung, dan ambang rule tidak diubah.");
  }

  const blocklist = await requestJson(`${API_BASE_URL}/api/blocked-ips?page=1&limit=100`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const row = (Array.isArray(blocklist.data) ? blocklist.data : [])
    .find((item) => item.ip_address === TEST_IP);
  if (!row || row.source !== "behavioral_rule") {
    throw new Error("Event terdeteksi, tetapi entri IP dari behavioral_rule tidak ditemukan pada blocklist internal.");
  }

  console.log("LULUS: burst rule real-time terpicu dan IP masuk blocklist internal.");
  console.log(JSON.stringify({
    ip_address: TEST_IP,
    click_count: CLICK_COUNT,
    detection_source: triggered.detection.prediction_source,
    detection_reason: triggered.detection.detection_reason,
    internal_blocklist_source: row.source,
    google_ads_mutation: "tidak diuji; IP dokumentasi dan tidak ada campaign_id",
  }, null, 2));
  console.log("Catatan: event uji dan IP dokumentasi tetap tersimpan di MongoDB. Jangan gunakan script ini terhadap IP pelanggan/produksi.");
}

main().catch((error) => {
  console.error(`GAGAL: ${error.message}`);
  process.exitCode = 1;
});
