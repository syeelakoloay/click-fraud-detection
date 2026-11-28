"""Feature preparation for the MarTech simulated click-fraud benchmark.

This schema is deliberately separate from the production CPA click-event schema.
It must not be used as a drop-in replacement for the live `/predict` model.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

RAW_COLUMNS = [
    "android_id", "apptype", "carrier", "dev_height", "dev_ppi", "dev_width",
    "lan", "media_id", "ntt", "os", "osv", "package", "version",
    "fea_hash", "location", "fea1_hash", "cus_type", "timestamp",
]

CATEGORICAL_FEATURES = [
    "android_id", "apptype", "carrier", "lan", "media_id", "ntt", "os",
    "osv", "package", "version", "fea_hash", "location", "fea1_hash", "cus_type",
]
NUMERIC_FEATURES = [
    "dev_height", "dev_ppi", "dev_width", "hour_utc", "minute_utc",
    "day_of_week_utc", "day_offset",
]
FEATURE_COLUMNS = CATEGORICAL_FEATURES + NUMERIC_FEATURES
OPTIONAL_RAW_COLUMNS = {"lan", "osv"}


def prepare_martech_frame(
    frame: pd.DataFrame,
    *,
    timestamp_origin_ms: float,
    require_label: bool = False,
) -> pd.DataFrame:
    """Convert raw MarTech rows into the exact LightGBM feature schema."""
    if not isinstance(frame, pd.DataFrame):
        raise TypeError("Input MarTech harus berupa pandas DataFrame.")

    missing = [
        name for name in RAW_COLUMNS
        if name not in frame.columns and name not in OPTIONAL_RAW_COLUMNS
    ]
    if missing:
        raise ValueError("Kolom MarTech wajib tidak ditemukan: " + ", ".join(missing))
    if require_label and "label" not in frame.columns:
        raise ValueError("Kolom label wajib tersedia untuk training.")

    work = frame.copy()
    for name in OPTIONAL_RAW_COLUMNS:
        if name not in work.columns:
            work[name] = pd.NA

    timestamps = pd.to_numeric(work["timestamp"], errors="coerce")
    if timestamps.isna().any():
        raise ValueError("timestamp MarTech harus berisi Unix epoch milliseconds yang valid.")
    dt = pd.to_datetime(timestamps, unit="ms", utc=True, errors="coerce")
    if dt.isna().any():
        raise ValueError("timestamp MarTech mengandung nilai tanggal yang tidak valid.")

    origin = float(timestamp_origin_ms)
    if not pd.notna(origin):
        raise ValueError("timestamp_origin_ms tidak valid.")

    work["hour_utc"] = dt.dt.hour.astype("int16")
    work["minute_utc"] = dt.dt.minute.astype("int16")
    work["day_of_week_utc"] = dt.dt.dayofweek.astype("int8")
    work["day_offset"] = ((timestamps.astype("float64") - origin) / 86_400_000.0).astype("float32")

    for name in CATEGORICAL_FEATURES:
        work[name] = work[name].fillna("__MISSING__").astype("string").str.strip()
        work[name] = work[name].replace("", "__MISSING__").astype("category")

    for name in NUMERIC_FEATURES:
        work[name] = pd.to_numeric(work[name], errors="coerce")

    result = work[FEATURE_COLUMNS].copy()
    if result[NUMERIC_FEATURES].isna().any().any():
        nulls = result[NUMERIC_FEATURES].isna().sum()
        raise ValueError(
            "Fitur numerik MarTech berisi nilai invalid: "
            + ", ".join(f"{key}={value}" for key, value in nulls.items() if value)
        )
    return result


def validate_martech_training_frame(frame: pd.DataFrame) -> pd.Series:
    """Validate label and record identifiers, returning clean binary labels."""
    if "label" not in frame.columns:
        raise ValueError("Kolom label tidak ditemukan pada train.csv.")
    labels = pd.to_numeric(frame["label"], errors="coerce")
    if labels.isna().any() or set(labels.unique()) != {0, 1}:
        raise ValueError("label harus lengkap dan hanya berisi 0 (Normal) atau 1 (Fraud).")
    if "sid" in frame.columns and frame["sid"].duplicated().any():
        raise ValueError("sid duplikat ditemukan; evaluasi ditolak agar sampel tidak terulang.")
    if "Unnamed: 0" in frame.columns:
        index_values = pd.to_numeric(frame["Unnamed: 0"], errors="coerce")
        if index_values.isna().any() or index_values.duplicated().any():
            raise ValueError("Kolom index administratif MarTech tidak valid atau duplikat.")
    return labels.astype("int8")


def prepare_martech_payload(payload: dict[str, Any], *, timestamp_origin_ms: float) -> pd.DataFrame:
    if not isinstance(payload, dict):
        raise TypeError("Body prediksi MarTech harus berupa object JSON.")
    return prepare_martech_frame(pd.DataFrame([payload]), timestamp_origin_ms=timestamp_origin_ms)
