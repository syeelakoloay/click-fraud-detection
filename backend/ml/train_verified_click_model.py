"""Train/evaluate click-level Random Forest only on independently verified labels.

Input: backend/dataset/click_fraud_verified.csv
Manifest: backend/dataset/click_fraud_verified.manifest.json
The existing 5,000-row demo/Kaggle-derived file is deliberately NOT promoted
as independently verified. bot_likelihood_score is never an input feature.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import joblib
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
DATASET_DIR = ML_DIR.parent / "dataset"
DATA_FILE = DATASET_DIR / "click_fraud_verified.csv"
MANIFEST_FILE = DATASET_DIR / "click_fraud_verified.manifest.json"
RESULTS_DIR = ML_DIR / "results"
MODEL_FILE = RESULTS_DIR / "verified_click_random_forest_model.joblib"
METRICS_FILE = RESULTS_DIR / "verified_click_model_metrics.json"
REPORT_FILE = RESULTS_DIR / "verified_click_classification_report.csv"
CONFUSION_FILE = RESULTS_DIR / "verified_click_confusion_matrix.csv"
METADATA_FILE = RESULTS_DIR / "verified_click_model_metadata.json"

NUMERIC_FEATURES = [
    "click_hour", "click_duration", "scroll_depth", "mouse_movement",
    "keystrokes_detected", "click_frequency", "time_since_last_click",
    "VPN_usage", "proxy_usage",
]
CATEGORICAL_FEATURES = [
    "click_day_of_week", "device_type", "browser", "operating_system",
    "ad_position", "device_ip_reputation",
]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
RAW_REQUIRED = [
    "click_id", "timestamp", "device_type", "browser", "operating_system",
    "click_duration", "scroll_depth", "mouse_movement", "keystrokes_detected",
    "ad_position", "click_frequency", "time_since_last_click",
    "device_ip_reputation", "VPN_usage", "proxy_usage", "is_fraudulent",
]
MIN_ROWS = 10_000
MIN_PER_CLASS = 500


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest(manifest: dict) -> None:
    required = [
        "label_source", "source_url_or_reference", "verification_method",
        "label_column", "adjudication_rule", "license",
    ]
    missing = [key for key in required if not str(manifest.get(key, "")).strip()]
    if missing:
        raise ValueError("Manifest belum lengkap: " + ", ".join(missing))
    if manifest.get("label_column") != "is_fraudulent":
        raise ValueError("label_column pada manifest harus 'is_fraudulent'.")
    if manifest.get("independent_of_bot_likelihood_score") is not True:
        raise ValueError("Manifest wajib menyatakan independent_of_bot_likelihood_score=true.")
    if manifest.get("bot_likelihood_score_used_to_assign_label") is not False:
        raise ValueError("Label tidak boleh ditentukan menggunakan bot_likelihood_score.")
    if int(manifest.get("annotator_count", 0)) < 1:
        raise ValueError("annotator_count harus minimal 1 dan didasarkan pada proses label yang nyata.")


def main() -> int:
    if not DATA_FILE.exists() or not MANIFEST_FILE.exists():
        print("DATASET VERIFIED BELUM TERSEDIA.")
        print(f"Letakkan dataset berlabel independen di: {DATA_FILE}")
        print(f"Lengkapi manifest dari template: {DATASET_DIR / 'click_fraud_verified.manifest.example.json'}")
        return 2

    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    validate_manifest(manifest)
    df = pd.read_csv(DATA_FILE)
    missing = [column for column in RAW_REQUIRED if column not in df.columns]
    if missing:
        raise ValueError("Kolom wajib tidak ditemukan: " + ", ".join(missing))
    if len(df) < MIN_ROWS:
        raise ValueError(f"Dataset memuat {len(df):,} baris; dibutuhkan minimal {MIN_ROWS:,} baris untuk proses ini.")
    if df["click_id"].duplicated().any():
        raise ValueError("click_id duplikat ditemukan; bersihkan duplikasi tanpa menghapus label valid secara diam-diam.")

    y = pd.to_numeric(df["is_fraudulent"], errors="coerce")
    if y.isna().any() or not set(y.unique()).issubset({0, 1}) or set(y.unique()) != {0, 1}:
        raise ValueError("is_fraudulent wajib hanya berisi label independen 0 dan 1 tanpa nilai kosong.")
    y = y.astype(int)
    class_counts = y.value_counts().to_dict()
    if min(class_counts.values()) < MIN_PER_CLASS:
        raise ValueError(f"Setiap kelas minimal {MIN_PER_CLASS} baris; distribusi sekarang {class_counts}.")

    timestamps = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
    if timestamps.isna().any():
        raise ValueError("Ada timestamp kosong/tidak valid.")
    work = df.copy()
    work["click_hour"] = timestamps.dt.hour
    work["click_day_of_week"] = timestamps.dt.day_name()
    for column in NUMERIC_FEATURES:
        work[column] = pd.to_numeric(work[column], errors="coerce")
    for column in CATEGORICAL_FEATURES:
        work[column] = work[column].astype("string").str.strip().replace("", pd.NA)
    if work[FEATURES].isna().any().any():
        nulls = work[FEATURES].isna().sum()
        raise ValueError("Fitur wajib kosong: " + ", ".join(f"{k}={v}" for k, v in nulls.items() if v))
    if "bot_likelihood_score" in work.columns:
        print("Audit: bot_likelihood_score ditemukan pada sumber tetapi DIKECUALIKAN dari seluruh fitur.")

    # Hold out the latest 20% of unique dates; no random shuffle and no training on test dates.
    date_series = timestamps.dt.floor("D")
    unique_dates = sorted(date_series.unique())
    if len(unique_dates) < 30:
        raise ValueError("Diperlukan minimal 30 tanggal unik untuk evaluasi kronologis.")
    split_pos = max(1, int(len(unique_dates) * 0.8))
    cutoff = unique_dates[split_pos]
    train_mask = date_series < cutoff
    test_mask = ~train_mask
    X = work[FEATURES]
    X_train, X_test = X.loc[train_mask], X.loc[test_mask]
    y_train, y_test = y.loc[train_mask], y.loc[test_mask]
    if y_train.nunique() != 2 or y_test.nunique() != 2:
        raise ValueError("Train dan test kronologis wajib masing-masing memiliki label Valid dan Fraud.")

    preprocessor = ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median"))]), NUMERIC_FEATURES),
        ("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]), CATEGORICAL_FEATURES),
    ], remainder="drop")
    model = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(
            n_estimators=500, min_samples_leaf=2, max_features="sqrt",
            class_weight="balanced_subsample", random_state=42, n_jobs=-1,
        )),
    ])
    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, list(model.classes_).index(1)]
    metrics = {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, predictions)),
        "precision_fraud": float(precision_score(y_test, predictions, zero_division=0)),
        "recall_fraud": float(recall_score(y_test, predictions, zero_division=0)),
        "f1_fraud": float(f1_score(y_test, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "average_precision": float(average_precision_score(y_test, probabilities)),
        "majority_baseline_accuracy": float(accuracy_score(y_test, [int(y_train.mode().iloc[0])] * len(y_test))),
    }
    matrix = confusion_matrix(y_test, predictions, labels=[0, 1])
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)
    METRICS_FILE.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    pd.DataFrame(matrix, index=["actual_valid", "actual_fraud"], columns=["pred_valid", "pred_fraud"]).to_csv(CONFUSION_FILE)
    pd.DataFrame(classification_report(y_test, predictions, labels=[0, 1], target_names=["Valid", "Fraud"], output_dict=True, zero_division=0)).transpose().to_csv(REPORT_FILE)
    metadata = {
        "model_type": "RandomForestClassifier",
        "data_level": "click-level",
        "label_source": manifest["label_source"],
        "verification_method": manifest["verification_method"],
        "independent_of_bot_likelihood_score": True,
        "excluded_predictors": ["bot_likelihood_score", "click_id", "user_id", "ip_address", "referrer_url", "page_url", "timestamp"],
        "feature_columns": FEATURES,
        "rows_total": int(len(df)),
        "rows_train": int(len(X_train)),
        "rows_test": int(len(X_test)),
        "class_counts": {str(k): int(v) for k, v in class_counts.items()},
        "train_dates": [str(min(date_series.loc[train_mask]).date()), str(max(date_series.loc[train_mask]).date())],
        "test_dates": [str(min(date_series.loc[test_mask]).date()), str(max(date_series.loc[test_mask]).date())],
        "test_cutoff_date": str(pd.Timestamp(cutoff).date()),
        "dataset_sha256": sha256_file(DATA_FILE),
        "meets_accuracy_target_over_95": bool(metrics["accuracy"] > 0.95),
        "warning": "Hasil berlaku untuk dataset dan periode uji ini; bukan jaminan performa pada trafik mendatang.",
    }
    METADATA_FILE.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print("Evaluasi verified click model selesai (test = 20% tanggal terbaru, tidak diacak).")
    for key, value in metrics.items():
        print(f"{key}: {value:.4f} ({value * 100:.2f}%)")
    print(f"Model: {MODEL_FILE}")
    print(f"Metadata: {METADATA_FILE}")
    print("Model ini dapat dipakai prediction_api.py dengan CLICK_MODEL_PATH setelah hasil dievaluasi.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        print(f"TRAINING DITOLAK: {exc}", file=sys.stderr)
        raise SystemExit(2)
