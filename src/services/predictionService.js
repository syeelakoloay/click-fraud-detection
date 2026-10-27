
"use strict";

const ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:8000";

async function predict(input) {
  let response;

  try {
    response = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const serviceError = new Error(
      "Layanan ML tidak dapat dihubungi. Pastikan server Python berjalan."
    );
    serviceError.status = 503;
    throw serviceError;
  }

  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.error || "Prediksi gagal diproses.");
    error.status = response.status;
    error.details = result.missing_features;
    throw error;
  }

  return result;
}

module.exports = { predict };
