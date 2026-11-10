"use strict";

const {
  preparePredictionFeatures,
} = require("./predictionFeatureService");

const ML_API_URL = (
  process.env.ML_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const parsedTimeout = Number(process.env.ML_API_TIMEOUT_MS || 10000);
const ML_API_TIMEOUT_MS =
  Number.isInteger(parsedTimeout) && parsedTimeout > 0
    ? parsedTimeout
    : 10000;

async function predict(input) {
  let features;

  try {
    if (
      input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      input.timestamp !== undefined
    ) {
      features = preparePredictionFeatures(input);
    } else {
      features = input;
    }
  } catch (error) {
    error.status = 400;
    error.code = "INVALID_INPUT";
    throw error;
  }

  let response;

  try {
    response = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(features),
      signal: AbortSignal.timeout(ML_API_TIMEOUT_MS),
    });
  } catch (error) {
    const serviceError = new Error(
      error.name === "TimeoutError" || error.name === "AbortError"
        ? "Layanan ML tidak merespons dalam batas waktu yang ditentukan."
        : "Layanan ML tidak dapat dihubungi. Pastikan server Python berjalan."
    );
    serviceError.status = 503;
    serviceError.code =
      error.name === "TimeoutError" || error.name === "AbortError"
        ? "ML_SERVICE_TIMEOUT"
        : "ML_SERVICE_UNAVAILABLE";
    throw serviceError;
  }

  let result;

  try {
    result = await response.json();
  } catch (_error) {
    const serviceError = new Error("Respons dari layanan ML tidak valid.");
    serviceError.status = 502;
    serviceError.code = "INVALID_ML_RESPONSE";
    throw serviceError;
  }

  if (!response.ok) {
    const serviceError = new Error(
      "Layanan ML gagal memproses permintaan prediksi."
    );
    serviceError.status = response.status >= 500 ? 502 : response.status;
    serviceError.code = "ML_PREDICTION_FAILED";
    serviceError.details = result.missing_features
      ? { missing_features: result.missing_features }
      : undefined;
    throw serviceError;
  }

  return result;
}

module.exports = {
  predict,
  ML_API_URL,
  ML_API_TIMEOUT_MS,
};
