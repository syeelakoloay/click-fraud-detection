"""Train a next-day campaign risk model from Google Ads invalid-click metrics.

The target is campaign-day `metrics.invalid_clicks > 0`. Predictors are built
only from the immediately preceding calendar day for the same campaign, so
same-day label-source data is never used as a feature. This is a campaign-day
forecasting model, not an individual-click classifier or a live click stream.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score, average_precision_score, balanced_accuracy_score,
    classification_report, confusion_matrix, f1_score, precision_score,
    recall_score, roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ML_DIR = Path(__file__).resolve().parent
DATA_FILE = ML_DIR / "datasets" / "google_ads_campaign_daily.csv"
RESULTS_DIR = ML_DIR / "results"
MODEL_FILE = RESULTS_DIR / "google_ads_campaign_day_model.joblib"
METRICS_FILE = RESULTS_DIR / "google_ads_campaign_day_metrics.json"
STATUS_FILE = RESULTS_DIR / "google_ads_campaign_training_status.json"

RAW_METRICS = ["impressions", "clicks", "cost_micros", "invalid_clicks", "invalid_click_rate"]
LAG_FEATURES = [
    "previous_day_impressions", "previous_day_clicks", "previous_day_cost_micros",
    "previous_day_invalid_clicks", "previous_day_invalid_click_rate",
    "previous_day_ctr", "previous_day_average_cpc_micros",
]
NUMERIC_FEATURES = LAG_FEATURES + ["is_weekend"]
CATEGORICAL_FEATURES = ["day_of_week", "month", "campaign_channel_type"]
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def write_status(status: str, reason: str, **extra) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps({"status": status, "reason": reason, **extra}, indent=2), encoding="utf-8")


def main() -> int:
    if not DATA_FILE.exists():
        write_status("insufficient_data", "Belum ada data Google Ads. Hubungkan OAuth dan sinkronkan minimal 90 hari data kampanye.")
        print(f"Dataset belum ada: {DATA_FILE}")
        return 2

    df = pd.read_csv(DATA_FILE)
    required = ["date", "campaign_id", "campaign_channel_type", *RAW_METRICS, "has_invalid_clicks"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError("Kolom wajib tidak ditemukan: " + ", ".join(missing))
    if df.empty:
        write_status("insufficient_data", "Dataset Google Ads kosong.")
        return 2

    df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True).dt.floor("D")
    if df["date"].isna().any():
        raise ValueError("Tanggal pada dataset Google Ads mengandung nilai tidak valid.")
    df["campaign_id"] = df["campaign_id"].astype("string").str.strip()
    if df["campaign_id"].isna().any() or (df["campaign_id"] == "").any():
        raise ValueError("campaign_id tidak boleh kosong.")

    numeric = [*RAW_METRICS, "has_invalid_clicks"]
    for column in numeric:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    if df[numeric].isna().any().any():
        raise ValueError("Nilai numerik Google Ads tidak valid atau kosong.")
    if not set(df["has_invalid_clicks"].astype(int).unique()).issubset({0, 1}):
        raise ValueError("has_invalid_clicks hanya boleh 0 atau 1.")
    if (df["has_invalid_clicks"].astype(int) != (df["invalid_clicks"] > 0).astype(int)).any():
        raise ValueError("Label has_invalid_clicks tidak konsisten dengan metrics.invalid_clicks.")
    if any((df[column] < 0).any() for column in RAW_METRICS):
        raise ValueError("Metrik Google Ads tidak boleh negatif.")
    if df.duplicated(["date", "campaign_id"]).any():
        raise ValueError("Ada baris campaign-day duplikat; sinkronisasi ulang dataset dari Google Ads.")

    # Strict one-calendar-day lag: only data available before the target day is used.
    df = df.sort_values(["campaign_id", "date"]).reset_index(drop=True)
    grouped = df.groupby("campaign_id", sort=False)
    df["previous_date"] = grouped["date"].shift(1)
    for source in RAW_METRICS:
        df[f"previous_day_{source}"] = grouped[source].shift(1)
    df["previous_day_ctr"] = df["previous_day_clicks"] / df["previous_day_impressions"].clip(lower=1)
    df["previous_day_average_cpc_micros"] = df["previous_day_cost_micros"] / df["previous_day_clicks"].clip(lower=1)

    # Skip rows without a row for the exact preceding calendar date. A stale
    # non-consecutive campaign record must not masquerade as yesterday's data.
    consecutive = (df["date"] - df["previous_date"]).dt.days.eq(1)
    work = df.loc[consecutive].copy()
    if work.empty:
        write_status("insufficient_data", "Belum ada pasangan data kampanye pada hari berurutan. Sinkronkan rentang tanggal yang lebih panjang.")
        print("Tidak ditemukan campaign-day dengan data hari sebelumnya yang berurutan.")
        return 2

    work["day_of_week"] = work["date"].dt.day_name()
    work["month"] = work["date"].dt.month.astype(str)
    work["is_weekend"] = work["date"].dt.dayofweek.isin([5, 6]).astype(int)
    work["campaign_channel_type"] = work["campaign_channel_type"].fillna("UNKNOWN").astype(str)
    X = work[FEATURE_COLUMNS].copy()
    for column in CATEGORICAL_FEATURES:
        X[column] = X[column].fillna("UNKNOWN").astype(str)
    for column in NUMERIC_FEATURES:
        X[column] = pd.to_numeric(X[column], errors="coerce")
    if X.isna().any().any():
        raise ValueError("Fitur hari sebelumnya masih memiliki nilai kosong.")

    y = work["has_invalid_clicks"].astype(int)
    unique_dates = sorted(work["date"].unique())
    row_count = len(work)
    positive = int(y.sum())
    negative = int((y == 0).sum())
    if row_count < 150 or positive < 25 or negative < 25 or len(unique_dates) < 30:
        reason = (
            f"Data belum cukup setelah membuat fitur hari sebelumnya: rows={row_count}, "
            f"positive={positive}, negative={negative}, dates={len(unique_dates)}. "
            "Target minimal 150 campaign-day berurutan, 25 positif, 25 negatif, dan 30 tanggal unik."
        )
        write_status("insufficient_data", reason, rows=row_count, positive=positive, negative=negative, dates=len(unique_dates))
        print(reason)
        return 2

    # Chronological 60/20/20 train/validation/test split by date, not random rows.
    train_end_index = max(1, int(len(unique_dates) * 0.60))
    validation_end_index = max(train_end_index + 1, int(len(unique_dates) * 0.80))
    if validation_end_index >= len(unique_dates):
        raise ValueError("Tanggal unik tidak cukup untuk train/validation/test kronologis.")
    train_end_date = unique_dates[train_end_index]
    validation_end_date = unique_dates[validation_end_index]
    train_mask = work["date"] < train_end_date
    validation_mask = (work["date"] >= train_end_date) & (work["date"] < validation_end_date)
    test_mask = work["date"] >= validation_end_date
    X_train, X_validation, X_test = X.loc[train_mask], X.loc[validation_mask], X.loc[test_mask]
    y_train, y_validation, y_test = y.loc[train_mask], y.loc[validation_mask], y.loc[test_mask]

    for split_name, labels in [("train", y_train), ("validation", y_validation), ("test", y_test)]:
        if labels.nunique() != 2:
            reason = f"Split {split_name} tidak memiliki dua kelas. Tambahkan data kampanye dan tanggal; model tidak dilatih."
            write_status("insufficient_data", reason, rows=row_count, positive=positive, negative=negative, dates=len(unique_dates))
            print(reason)
            return 2

    preprocessor = ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median"))]), NUMERIC_FEATURES),
        ("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), CATEGORICAL_FEATURES),
    ], remainder="drop")
    model = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(
            n_estimators=400, min_samples_leaf=2, max_features="sqrt",
            class_weight="balanced_subsample", random_state=42, n_jobs=-1,
        )),
    ])
    model.fit(X_train, y_train)

    # Select a probability threshold on validation only; never tune on test.
    validation_scores = model.predict_proba(X_validation)[:, list(model.classes_).index(1)]
    candidates = []
    for threshold in np.linspace(0.05, 0.95, 91):
        val_predictions = (validation_scores >= threshold).astype(int)
        candidates.append((
            f1_score(y_validation, val_predictions, zero_division=0),
            precision_score(y_validation, val_predictions, zero_division=0),
            threshold,
        ))
    best_f1, best_precision, selected_threshold = max(candidates, key=lambda item: (item[0], item[1], item[2]))

    test_scores = model.predict_proba(X_test)[:, list(model.classes_).index(1)]
    test_predictions = (test_scores >= selected_threshold).astype(int)
    train_majority = int(y_train.mode().iloc[0])
    metrics = {
        "data_level": "campaign-day-next-day-forecast",
        "prediction_horizon": "next_calendar_day",
        "label_definition": "current day metrics.invalid_clicks > 0",
        "label_source": "Google Ads API metrics.invalid_clicks",
        "features_source": "strict previous calendar day for the same campaign",
        "rows_total_after_lag": int(row_count),
        "rows_train": int(len(X_train)),
        "rows_validation": int(len(X_validation)),
        "rows_test": int(len(X_test)),
        "positive_campaign_days": positive,
        "negative_campaign_days": negative,
        "accuracy": float(accuracy_score(y_test, test_predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, test_predictions)),
        "precision": float(precision_score(y_test, test_predictions, zero_division=0)),
        "recall": float(recall_score(y_test, test_predictions, zero_division=0)),
        "f1_score": float(f1_score(y_test, test_predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, test_scores)),
        "average_precision": float(average_precision_score(y_test, test_scores)),
        "majority_baseline_accuracy": float(accuracy_score(y_test, [train_majority] * len(y_test))),
        "selected_threshold_from_validation": float(selected_threshold),
        "validation_f1_at_selected_threshold": float(best_f1),
        "validation_precision_at_selected_threshold": float(best_precision),
        "features": FEATURE_COLUMNS,
        "excluded_same_day_features": RAW_METRICS + ["has_invalid_clicks"],
        "excluded_identifier_columns": ["campaign_id", "campaign_name"],
        "train_end_exclusive": str(pd.Timestamp(train_end_date).date()),
        "validation_end_exclusive": str(pd.Timestamp(validation_end_date).date()),
        "test_start_date": str(pd.Timestamp(validation_end_date).date()),
        "warning": (
            "Model memprediksi risiko invalid clicks kampanye untuk hari kalender berikutnya dari metrik hari sebelumnya. "
            "Ini bukan klasifikasi click-level, bukan streaming per klik, dan bukan jaminan mitigasi otomatis real-time."
        ),
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)
    METRICS_FILE.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    pd.DataFrame(
        confusion_matrix(y_test, test_predictions, labels=[0, 1]),
        index=["actual_no_invalid_clicks", "actual_invalid_clicks"],
        columns=["pred_no_invalid_clicks", "pred_invalid_clicks"],
    ).to_csv(RESULTS_DIR / "google_ads_campaign_day_confusion_matrix.csv")
    pd.DataFrame(classification_report(
        y_test, test_predictions, labels=[0, 1],
        target_names=["No invalid clicks", "Has invalid clicks"],
        output_dict=True, zero_division=0,
    )).transpose().to_csv(RESULTS_DIR / "google_ads_campaign_day_classification_report.csv")
    write_status("trained", "Model risiko kampanye-hari berikutnya selesai dilatih dan dievaluasi pada test kronologis terpisah.", metrics=metrics)
    print(json.dumps(metrics, indent=2))
    print(f"Model tersimpan: {MODEL_FILE}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError) as exc:
        write_status("error", str(exc))
        print(f"TRAINING GAGAL: {exc}", file=sys.stderr)
        raise SystemExit(2)
