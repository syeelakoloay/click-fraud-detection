"use strict";

// ============================================================
// Aktivitas 17 - Real-time prediction & mitigasi IP
// PIC: Finkly
//
// Tugas file ini:
//   1. Ambil riwayat klik dari IP yang sama (lewat eventService milik Syeela)
//   2. Ringkas riwayat menjadi angka
//   3. Bungkus event baru + ringkasan riwayat
//   4. Kirim ke model ML dan terima label + probabilitas
//
// File ini TIDAK menyimpan event dan TIDAK memblokir IP.
// Penyimpanan/pemblokiran dikerjakan di Aktivitas 20 dan 23.
// ============================================================

const { createEvent, findEventsByIP } = require("./eventService");

const { addBlockedIP, getBlockedIP } = require("./blockedIPService");

// Lama jendela riwayat (menit). Bisa diubah lewat .env.
const HISTORY_WINDOW_MINUTES = Number(process.env.HISTORY_WINDOW_MINUTES) || 10;

// Maksimal event riwayat yang dibaca (listEvents membatasi maks. 100).
const HISTORY_LIMIT = 100;

// Endpoint prediction Python. URL kosong berarti prediksi tidak tersedia;
// sistem tidak boleh mengembalikan hasil tiruan sebagai keputusan ML.
const PREDICTION_URL = process.env.PREDICTION_URL || "";
const PREDICTION_TIMEOUT_MS = 5000;

// Field mentah event yang dipakai model Bryan (ml/feature_engineering.py).
// click_hour dan click_day_of_week TIDAK ada di sini karena dihitung dari timestamp.
const MODEL_RAW_FIELDS = [
  "click_duration",
  "scroll_depth",
  "mouse_movement",
  "keystrokes_detected",
  "click_frequency",
  "time_since_last_click",
  "VPN_usage",
  "proxy_usage",
  "device_type",
  "browser",
  "operating_system",
  "ad_position",
  "device_ip_reputation",
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ------------------------------------------------------------
// Validasi event masuk
// ------------------------------------------------------------
function validateEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Event harus berupa object.");
  }
  const required = [
    "click_id",
    "ip_address",
    "timestamp",
    // field mentah yang dibutuhkan untuk membentuk feature model
    ...MODEL_RAW_FIELDS,
  ];
  for (const field of required) {
    if (
      event[field] === undefined ||
      event[field] === null ||
      event[field] === ""
    ) {
      throw new TypeError(`Field ${field} wajib diisi.`);
    }
  }
  if (Number.isNaN(new Date(event.timestamp).getTime())) {
    throw new TypeError("timestamp bukan tanggal yang valid.");
  }
}

// ------------------------------------------------------------
// Langkah 1: ambil riwayat klik dari IP yang sama
// Memakai findEventsByIP milik Syeela (hasil urut dari yang terbaru).
// Yang dihitung hanya klik SEBELUM event ini, dalam jendela waktu tertentu.
// ------------------------------------------------------------
async function getHistoryByIp(event, windowMinutes = HISTORY_WINDOW_MINUTES) {
  const result = await findEventsByIP(event.ip_address, {
    limit: HISTORY_LIMIT,
    sortBy: "timestamp",
    sortOrder: "desc",
  });

  const current = new Date(event.timestamp).getTime();
  const start = current - windowMinutes * 60 * 1000;

  return result.data.filter((h) => {
    const t = new Date(h.timestamp).getTime();
    return h.click_id !== event.click_id && t <= current && t >= start;
  });
}

// ------------------------------------------------------------
// Langkah 2: ringkas riwayat menjadi angka
// ------------------------------------------------------------
function summarizeHistory(
  history,
  currentTimestamp,
  windowMinutes = HISTORY_WINDOW_MINUTES,
) {
  const clickCount = history.length;
  const fraudCount = history.filter((h) => (h.predicted_is_fraudulent ?? h.is_fraudulent) === 1).length;

  // history[0] adalah klik terbaru sebelum event ini
  let secondsSinceLast = null;
  if (clickCount > 0) {
    const last = new Date(history[0].timestamp).getTime();
    secondsSinceLast = (new Date(currentTimestamp).getTime() - last) / 1000;
  }

  return {
    window_minutes: windowMinutes,
    history_click_count: clickCount,
    history_fraud_count: fraudCount,
    history_seconds_since_last: secondsSinceLast,
  };
}

// ------------------------------------------------------------
// Langkah 3: bungkus event + ringkasan riwayat
//
// "features" = 15 input model, SAMA PERSIS dengan feature_engineering.py:
//   numerik    : click_hour, click_duration, scroll_depth, mouse_movement,
//                keystrokes_detected, click_frequency, time_since_last_click,
//                VPN_usage, proxy_usage
//   kategorikal: click_day_of_week, device_type, browser, operating_system,
//                ad_position, device_ip_reputation
// click_hour dan click_day_of_week dihitung dari timestamp (zona waktu UTC).
//
// Tidak dikirim sebagai feature (mengikuti Bryan):
//   bot_likelihood_score (risiko data leakage), ip_address mentah,
//   user_id, URL, timestamp mentah.
//
// "history" = konteks riwayat IP. Model yang sekarang BELUM memakainya
// sebagai feature; dipakai untuk logging dan aturan mitigasi (Aktivitas 23).
// ------------------------------------------------------------
function buildPayload(event, historySummary) {
  const when = new Date(event.timestamp);

  return {
    event_meta: {
      click_id: event.click_id,
      ip_address: event.ip_address,
      timestamp: event.timestamp,
    },
    features: {
      click_hour: when.getUTCHours(),
      click_duration: event.click_duration,
      scroll_depth: event.scroll_depth,
      mouse_movement: event.mouse_movement,
      keystrokes_detected: event.keystrokes_detected,
      click_frequency: event.click_frequency,
      time_since_last_click: event.time_since_last_click,
      VPN_usage: event.VPN_usage,
      proxy_usage: event.proxy_usage,
      click_day_of_week: DAY_NAMES[when.getUTCDay()],
      device_type: event.device_type,
      browser: event.browser,
      operating_system: event.operating_system,
      ad_position: event.ad_position,
      device_ip_reputation: event.device_ip_reputation,
    },
    history: historySummary,
  };
}

// ------------------------------------------------------------
// Langkah 4: kirim ke model, terima { label, probability }
// ------------------------------------------------------------
async function sendToModel(payload) {
  // Jangan pernah mengembalikan prediksi tiruan sebagai hasil ML.
  if (!PREDICTION_URL) {
    const error = new Error("PREDICTION_URL belum dikonfigurasi; hasil prediksi ML tidak tersedia.");
    error.status = 503;
    throw error;
  }

  // Model hanya menerima 15 feature, jadi hanya "features" yang dikirim.
  const response = await fetch(PREDICTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload.features),
    signal: AbortSignal.timeout(PREDICTION_TIMEOUT_MS),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      `Endpoint prediction merespons error ${response.status}: ${
        (err.error && err.error.message) || ""
      }`,
    );
  }

  const result = await response.json();
  const label = Number(result.prediction);
  const fraudProbability = Number(
    result.probabilities && result.probabilities.Fraud,
  );

  // Periksa jawaban model sebelum dipakai.
  if (
    ![0, 1].includes(label) ||
    !Number.isFinite(fraudProbability) ||
    fraudProbability < 0 ||
    fraudProbability > 1
  ) {
    throw new Error("Respons endpoint prediction tidak valid.");
  }

  return { label, probability: fraudProbability, source: "model" };
}

// ------------------------------------------------------------
// Fungsi utama (dipakai ulang di Aktivitas 20 dan 23)
// ------------------------------------------------------------
async function predictWithHistory(event) {
  validateEvent(event);

  // Aktivitas 25: IP yang sudah ada di daftar blokir tidak perlu diprediksi lagi.
  const blockedEntry = await getBlockedIP(event.ip_address);
  if (blockedEntry) {
    return {
      click_id: event.click_id,
      ip_address: event.ip_address,
      label: null,
      probability: null,
      prediction_source: "ip_list",
      blocked_by_ip_list: true,
      ip_blocked: true,
      history_used: null,
    };
  }

  const history = await getHistoryByIp(event);
  const summary = summarizeHistory(history, event.timestamp);
  const payload = buildPayload(event, summary);
  const result = await sendToModel(payload);

  // Aktivitas 23: IP dimasukkan ke daftar blokir bila hasil prediksi fraud.
  // addBlockedIP bersifat idempoten: IP yang sama tidak tercatat dua kali.
  let ipBlocked = false;
  if (result.label === 1) {
    await addBlockedIP(event.ip_address, { source: "ml_prediction" });
    ipBlocked = true;
  }

  return {
    click_id: event.click_id,
    ip_address: event.ip_address,
    label: result.label, // 1 = fraud, 0 = valid
    probability: result.probability,
    prediction_source: result.source, // "model"
    blocked_by_ip_list: false,
    ip_blocked: ipBlocked,
    history_used: summary,
  };
}


/**
 * Production ingestion path for one new click event.
 * It runs the ML/IP-list check, stores the event with a separate prediction
 * field (ground-truth is_fraudulent remains optional), and preserves the event
 * even when the Python model is temporarily unavailable.
 */
async function ingestAndPredict(event) {
  validateEvent(event);

  let prediction;
  try {
    prediction = await predictWithHistory(event);
  } catch (error) {
    prediction = {
      label: null,
      probability: null,
      prediction_source: "model",
      prediction_status: "unavailable",
      blocked_by_ip_list: false,
      ip_blocked: false,
      message: error.status === 503
        ? error.message
        : "Layanan prediksi tidak dapat memproses event ini.",
    };
  }

  const blockedByList = prediction.blocked_by_ip_list === true;
  const hasModelPrediction = [0, 1].includes(prediction.label);
  const storedEvent = await createEvent({
    ...event,
    predicted_is_fraudulent: hasModelPrediction ? prediction.label : blockedByList ? 1 : undefined,
    prediction_probability: Number.isFinite(prediction.probability) ? prediction.probability : undefined,
    prediction_source: blockedByList ? "ip_list" : hasModelPrediction ? "model" : undefined,
    prediction_status: blockedByList ? "blocked" : hasModelPrediction ? "completed" : "unavailable",
  });

  return {
    data: storedEvent,
    prediction: {
      ...prediction,
      prediction_status: blockedByList ? "blocked" : hasModelPrediction ? "completed" : "unavailable",
    },
    accepted_for_processing: !blockedByList,
  };
}

module.exports = {
  getHistoryByIp,
  summarizeHistory,
  buildPayload,
  sendToModel,
  predictWithHistory,
  ingestAndPredict,
};
