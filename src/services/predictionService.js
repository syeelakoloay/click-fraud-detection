
"use strict";

const {
  preparePredictionFeatures,
} = require("./predictionFeatureService");

const ML_API_URL =
  process.env.ML_API_URL || "http://127.0.0.1:8000";

async function predict(input) {
  let features;

  try {
    // Data event mentah memiliki timestamp.
    // Ubah menjadi 15 fitur yang dibutuhkan model ML.
    if (
      input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      input.timestamp !== undefined
    ) {
      features = preparePredictionFeatures(input);
    } else {
      // Jika sudah berupa fitur, teruskan apa adanya.
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
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const serviceError = new Error(
      "Layanan ML tidak dapat dihubungi. Pastikan server Python berjalan."
    );
    serviceError.status = 503;
    throw serviceError;
  }

  let result;

  try {
    result = await response.json();
  } catch (error) {
    const serviceError = new Error(
      "Respons dari layanan ML tidak valid."
    );
    serviceError.status = 502;
    throw serviceError;
  }

  if (!response.ok) {
    const serviceError = new Error(
      result.error || "Prediksi gagal diproses."
    );
    serviceError.status = response.status;
    serviceError.details = result.missing_features
      ? { missing_features: result.missing_features }
      : undefined;
    throw serviceError;
  }

  return result;
}

module.exports = { predict };
