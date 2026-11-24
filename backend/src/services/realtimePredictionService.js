"use strict";

const { createEvent, updateEventByClickId, findEventsByIP } = require("./eventService");
const { addBlockedIP, getBlockedIP, updateGoogleAdsExclusion } = require("./blockedIPService");
const googleAdsService = require("./googleAdsService");
const {
  isRoutablePublicIPv4,
  isPredictionReadyEvent,
  getEventReceivedTime,
  isActiveBlockRecord,
  evaluateBurstRisk,
  validateRealtimeEvent,
} = require("./realtimeDetectionRules");

const HISTORY_WINDOW_MINUTES = Number(process.env.HISTORY_WINDOW_MINUTES) || 10;
const HISTORY_LIMIT = 100;
const PREDICTION_URL = process.env.PREDICTION_URL || "";
const PREDICTION_TIMEOUT_MS = Number(process.env.PREDICTION_TIMEOUT_MS || 5000);
const MODEL_RAW_FIELDS = [
  "click_duration", "scroll_depth", "mouse_movement", "keystrokes_detected",
  "click_frequency", "time_since_last_click", "VPN_usage", "proxy_usage",
  "device_type", "browser", "operating_system", "ad_position", "device_ip_reputation",
];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ipIngestionQueues = new Map();

function runInIpQueue(ipAddress, task) {
  const key = String(ipAddress).trim();
  const previous = ipIngestionQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  ipIngestionQueues.set(key, current);
  return current.finally(() => {
    if (ipIngestionQueues.get(key) === current) ipIngestionQueues.delete(key);
  });
}


function validateEvent(event) {
  return validateRealtimeEvent(event);
}

async function getHistoryByIp(event, windowMinutes = HISTORY_WINDOW_MINUTES) {
  const result = await findEventsByIP(event.ip_address, {
    limit: HISTORY_LIMIT, sortBy: "received_at", sortOrder: "desc",
  });
  const current = new Date(getEventReceivedTime(event)).getTime();
  const start = current - windowMinutes * 60 * 1000;
  return result.data.filter((item) => {
    const timestamp = new Date(getEventReceivedTime(item)).getTime();
    return item.click_id !== event.click_id && timestamp <= current && timestamp >= start;
  });
}

function summarizeHistory(history, currentTimestamp, windowMinutes = HISTORY_WINDOW_MINUTES) {
  const clickCount = history.length;
  const fraudCount = history.filter((item) => (item.predicted_is_fraudulent ?? item.is_fraudulent) === 1).length;
  let secondsSinceLast = null;
  if (clickCount > 0) {
    secondsSinceLast = (
      new Date(currentTimestamp).getTime() -
      new Date(getEventReceivedTime(history[0])).getTime()
    ) / 1000;
  }
  return { window_minutes: windowMinutes, history_click_count: clickCount, history_fraud_count: fraudCount, history_seconds_since_last: secondsSinceLast };
}

function buildPayload(event, historySummary) {
  const when = new Date(getEventReceivedTime(event));
  return {
    event_meta: { click_id: event.click_id, ip_address: event.ip_address, timestamp: event.timestamp },
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


async function sendToModel(payload) {
  if (!PREDICTION_URL) {
    const error = new Error("PREDICTION_URL belum dikonfigurasi; hasil prediksi ML tidak tersedia.");
    error.status = 503;
    error.code = "ML_PREDICTION_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(PREDICTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload.features),
    signal: AbortSignal.timeout(PREDICTION_TIMEOUT_MS),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Endpoint prediction merespons HTTP ${response.status}.`);
    error.status = response.status >= 500 ? 503 : response.status;
    error.code = "ML_PREDICTION_FAILED";
    throw error;
  }
  const label = Number(result.prediction);
  const fraudProbability = Number(result.probabilities && result.probabilities.Fraud);
  if (![0, 1].includes(label) || !Number.isFinite(fraudProbability) || fraudProbability < 0 || fraudProbability > 1) {
    throw new Error("Respons endpoint prediction tidak valid.");
  }
  return {
    label,
    probability: fraudProbability,
    source: "model",
    automationEligible: result.automation_eligible === true,
    modelReadiness: result.model_readiness || null,
  };
}

async function persistGoogleAdsResult(ipAddress, result) {
  if (!result || !result.status || result.status === "skipped") {
    await updateGoogleAdsExclusion(ipAddress, { status: "skipped", campaignId: result?.campaignId });
  } else if (result.status === "excluded") {
    await updateGoogleAdsExclusion(ipAddress, { status: "excluded", campaignId: result.campaignId });
  } else {
    await updateGoogleAdsExclusion(ipAddress, { status: "failed", campaignId: result.campaignId, error: result.reason || result.error || "Google Ads exclusion tidak berhasil." });
  }
}

async function tryGoogleAdsExclusion(ipAddress, source, campaignId) {
  try {
    const result = await googleAdsService.autoExcludeBlockedIp(ipAddress, { source, campaignId });
    await persistGoogleAdsResult(ipAddress, result);
    return result;
  } catch (error) {
    await persistGoogleAdsResult(ipAddress, { status: "failed", reason: error.message }).catch(() => {});
    return { status: "failed", reason: error.message, code: error.code || "GOOGLE_ADS_ERROR" };
  }
}

async function predictWithHistory(event, options = {}) {
  validateEvent(event);
  const existingBlocked = await getBlockedIP(event.ip_address);
  const historicalReferenceMatch = existingBlocked?.source === "historical_dataset_label";
  const activelyBlocked = isActiveBlockRecord(existingBlocked);
  if (activelyBlocked) {
    return {
      click_id: event.click_id,
      ip_address: event.ip_address,
      label: 1,
      probability: null,
      prediction_source: "ip_list",
      prediction_status: "blocked",
      blocked_by_ip_list: true,
      ip_blocked: true,
      detection_reason: existingBlocked.detection_reason || "ip_already_in_active_blocklist",
      historical_reference_match: false,
      history_used: null,
      google_ads_mitigation: { status: existingBlocked.google_ads_exclusion_status || "not_configured" },
    };
  }

  const history = await getHistoryByIp(event);
  const summary = summarizeHistory(history, getEventReceivedTime(event));
  const behavioralRisk = evaluateBurstRisk(event, history);
  let modelResult = null;
  let modelError = null;
  if (!options.skipModel && !behavioralRisk.triggered) {
    try {
      modelResult = await sendToModel(buildPayload(event, summary));
    } catch (error) {
      modelError = error.message;
    }
  }

  const modelAutoBlockEnabled = String(process.env.REALTIME_ML_AUTOBLOCK_ENABLED || "false").toLowerCase() === "true";
  const minFraudProbability = Number(process.env.REALTIME_ML_AUTOBLOCK_THRESHOLD || 0.99);
  const modelBlockAllowed = Boolean(modelResult?.automationEligible && modelAutoBlockEnabled
    && modelResult.label === 1 && modelResult.probability >= minFraudProbability);

  let ipBlocked = false;
  let predictionSource = modelResult ? "model" : null;
  let detectionReason = null;
  if (behavioralRisk.triggered) {
    await addBlockedIP(event.ip_address, { source: "behavioral_rule", detectionReason: behavioralRisk.reason });
    ipBlocked = true;
    predictionSource = "behavioral_rule";
    detectionReason = behavioralRisk.reason;
  } else if (modelBlockAllowed) {
    await addBlockedIP(event.ip_address, { source: "ml_prediction", detectionReason: "qualified_model_probability_threshold" });
    ipBlocked = true;
    predictionSource = "model";
    detectionReason = "qualified_model_probability_threshold";
  }

  const googleAdsMitigation = ipBlocked
    ? options.skipGoogleAds
      ? { status: "deferred" }
      : await tryGoogleAdsExclusion(event.ip_address, predictionSource, event.campaign_id)
    : { status: "not_triggered" };

  return {
    click_id: event.click_id,
    ip_address: event.ip_address,
    label: modelResult?.label ?? (behavioralRisk.triggered ? 1 : null),
    probability: modelResult?.probability ?? null,
    prediction_source: predictionSource || "model",
    prediction_status: modelResult ? (modelResult.automationEligible ? "completed" : "shadow_only") : "unavailable",
    blocked_by_ip_list: false,
    ip_blocked: ipBlocked,
    detection_reason: detectionReason,
    behavioral_risk: behavioralRisk,
    model_automation_eligible: modelResult?.automationEligible === true,
    model_readiness: modelResult?.modelReadiness || null,
    model_error: modelError,
    historical_reference_match: historicalReferenceMatch,
    history_used: summary,
    google_ads_mitigation: googleAdsMitigation,
  };
}

async function ingestAndPredict(event) {
  validateEvent(event);

  // Keep the critical rule path short and serialized by IP. ML scoring happens
  // after this lock is released so a slow model/network call cannot make clicks
  // fall outside the five-second burst window.
  const decision = await runInIpQueue(event.ip_address, async () => {
    const receivedAt = new Date();
    const acceptedEvent = {
      ...event,
      user_agent: String(event.user_agent || "").slice(0, 512),
      received_at: receivedAt,
    };
    const createdEvent = await createEvent(acceptedEvent);
    const prediction = await predictWithHistory(acceptedEvent, { skipModel: true, skipGoogleAds: true });
    return { acceptedEvent, createdEvent, prediction };
  });

  const { acceptedEvent, createdEvent } = decision;
  let prediction = decision.prediction;
  const ruleTriggered = prediction.prediction_source === "behavioral_rule";
  const blockedByList = prediction.blocked_by_ip_list === true;

  // Execute external campaign mutation outside the per-IP critical section.
  if (ruleTriggered) {
    prediction = {
      ...prediction,
      google_ads_mitigation: await tryGoogleAdsExclusion(
        acceptedEvent.ip_address, "behavioral_rule", acceptedEvent.campaign_id
      ),
    };
  }

  // Behavioral rules run before this network call. For non-blocked traffic,
  // retain the CPA model in shadow mode and persist its result separately.
  if (!prediction.ip_blocked && !blockedByList && !ruleTriggered) {
    try {
      const modelResult = await sendToModel(buildPayload(acceptedEvent, prediction.history_used));
      prediction = {
        ...prediction,
        label: modelResult.label,
        probability: modelResult.probability,
        prediction_source: "model",
        prediction_status: modelResult.automationEligible ? "completed" : "shadow_only",
        model_automation_eligible: modelResult.automationEligible,
        model_readiness: modelResult.modelReadiness,
        model_error: null,
      };

      const modelBlockEnabled = String(process.env.REALTIME_ML_AUTOBLOCK_ENABLED || "false").toLowerCase() === "true";
      const modelThreshold = Number(process.env.REALTIME_ML_AUTOBLOCK_THRESHOLD || 0.99);
      if (modelResult.automationEligible && modelBlockEnabled && modelResult.label === 1
        && modelResult.probability >= modelThreshold) {
        await addBlockedIP(acceptedEvent.ip_address, {
          source: "ml_prediction",
          detectionReason: "qualified_model_probability_threshold",
        });
        prediction = {
          ...prediction,
          ip_blocked: true,
          prediction_status: "blocked",
          detection_reason: "qualified_model_probability_threshold",
          google_ads_mitigation: await tryGoogleAdsExclusion(
            acceptedEvent.ip_address, "model", acceptedEvent.campaign_id
          ),
        };
      }
    } catch (error) {
      prediction = {
        ...prediction,
        prediction_source: "model",
        prediction_status: "unavailable",
        model_error: error.message,
      };
    }
  }

  const activeBlock = prediction.ip_blocked === true;
  const modelPrediction = prediction.prediction_source === "model"
    && [0, 1].includes(prediction.label);
  const update = {
    prediction_status: activeBlock ? "blocked" : prediction.prediction_status || "unavailable",
    prediction_source: blockedByList
      ? "ip_list"
      : ruleTriggered
        ? "behavioral_rule"
        : modelPrediction
          ? "model"
          : undefined,
    detection_reason: prediction.detection_reason || undefined,
  };
  if (blockedByList || ruleTriggered) update.predicted_is_fraudulent = 1;
  else if (modelPrediction) update.predicted_is_fraudulent = prediction.label;
  if (Number.isFinite(prediction.probability)) {
    update.prediction_probability = prediction.probability;
  }

  const updatedEvent = await updateEventByClickId(createdEvent.click_id, update);
  return {
    data: updatedEvent || { ...createdEvent, ...update },
    prediction,
    accepted_for_processing: !activeBlock,
  };
}

module.exports = {
  validateEvent,
  isPredictionReadyEvent,
  runInIpQueue,
  getHistoryByIp,
  summarizeHistory,
  buildPayload,
  evaluateBurstRisk,
  sendToModel,
  predictWithHistory,
  ingestAndPredict,
  isRoutablePublicIPv4,
};
