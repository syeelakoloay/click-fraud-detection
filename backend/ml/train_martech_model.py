"""Train an isolated LightGBM benchmark from the supplied MarTech click dataset.

The source labels describe simulated normal/cheating click sessions. This model
is not compatible with ClickGuard's existing CPA event schema and is therefore
kept as a separately named benchmark model, never silently promoted to /predict.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import lightgbm as lgb
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from martech_features import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    NUMERIC_FEATURES,
    prepare_martech_frame,
    validate_martech_training_frame,
)

ML_DIR = Path(__file__).resolve().parent
DATA_DIR = ML_DIR / "datasets" / "martech"
DATA_FILE = DATA_DIR / "train.csv"
RESULTS_DIR = ML_DIR / "results"
MODEL_FILE = RESULTS_DIR / "martech_lightgbm_model.txt"
METRICS_FILE = RESULTS_DIR / "martech_model_metrics.json"
METADATA_FILE = RESULTS_DIR / "martech_model_metadata.json"
STATUS_FILE = RESULTS_DIR / "martech_model_status.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def choose_threshold_f1(y_true, probabilities) -> float:
    thresholds = [i / 1000 for i in range(50, 951, 5)]
    scores = [
        (f1_score(y_true, probabilities >= threshold, zero_division=0),
         precision_score(y_true, probabilities >= threshold, zero_division=0),
         threshold)
        for threshold in thresholds
    ]
    return float(max(scores, key=lambda item: (item[0], item[1], item[2]))[2])


def evaluate(y_true, probabilities, threshold: float) -> dict:
    predictions = (probabilities >= threshold).astype("int8")
    return {
        "accuracy": float(accuracy_score(y_true, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, predictions)),
        "precision_fraud": float(precision_score(y_true, predictions, zero_division=0)),
        "recall_fraud": float(recall_score(y_true, predictions, zero_division=0)),
        "f1_fraud": float(f1_score(y_true, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "average_precision": float(average_precision_score(y_true, probabilities)),
        "threshold": float(threshold),
        "rows": int(len(y_true)),
        "confusion_matrix": confusion_matrix(y_true, predictions, labels=[0, 1]).tolist(),
    }


def main() -> int:
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Dataset MarTech tidak ditemukan: {DATA_FILE}")

    raw = pd.read_csv(DATA_FILE, low_memory=False)
    labels = validate_martech_training_frame(raw)
    numeric_timestamps = pd.to_numeric(raw["timestamp"], errors="coerce")
    if numeric_timestamps.isna().any():
        raise ValueError("timestamp berisi nilai kosong atau non-numerik.")
    if len(raw) < 100_000:
        raise ValueError("Jumlah data MarTech terlalu sedikit; minimal 100.000 baris untuk benchmark ini.")

    timestamp_origin_ms = float(numeric_timestamps.min())
    timestamps = pd.to_datetime(numeric_timestamps, unit="ms", utc=True, errors="coerce")
    if timestamps.isna().any():
        raise ValueError("Rentang timestamp MarTech tidak valid.")

    # Stable chronological 70/15/15 split: no random row mixing and no test fitting.
    order = timestamps.sort_values(kind="mergesort").index
    ordered = raw.loc[order].reset_index(drop=True)
    ordered_labels = labels.loc[order].reset_index(drop=True)
    ordered_timestamps = timestamps.loc[order].reset_index(drop=True)
    n_rows = len(ordered)
    train_end = int(n_rows * 0.70)
    validation_end = int(n_rows * 0.85)
    if min(train_end, validation_end - train_end, n_rows - validation_end) <= 0:
        raise ValueError("Split kronologis menghasilkan bagian kosong.")

    X_all = prepare_martech_frame(
        ordered,
        timestamp_origin_ms=timestamp_origin_ms,
        require_label=True,
    )
    y_train = ordered_labels.iloc[:train_end]
    y_validation = ordered_labels.iloc[train_end:validation_end]
    y_test = ordered_labels.iloc[validation_end:]
    if any(part.nunique() != 2 for part in (y_train, y_validation, y_test)):
        raise ValueError("Setiap split kronologis harus berisi kelas Normal dan Fraud.")

    X_train = X_all.iloc[:train_end].copy()
    X_validation = X_all.iloc[train_end:validation_end].copy()
    X_test = X_all.iloc[validation_end:].copy()
    # Category dictionaries are fitted on training rows only. Unknown future
    # categories become missing, rather than leaking test vocabulary into fit.
    for column in CATEGORICAL_FEATURES:
        training_categories = X_train[column].cat.categories
        X_validation[column] = X_validation[column].cat.set_categories(training_categories)
        X_test[column] = X_test[column].cat.set_categories(training_categories)

    model = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=1500,
        learning_rate=0.05,
        num_leaves=31,
        max_depth=-1,
        min_child_samples=80,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=2.0,
        random_state=42,
        n_jobs=-1,
        verbosity=-1,
    )
    model.fit(
        X_train,
        y_train,
        categorical_feature=CATEGORICAL_FEATURES,
        eval_set=[(X_validation, y_validation)],
        callbacks=[lgb.early_stopping(100, verbose=False)],
    )

    validation_probabilities = model.predict_proba(X_validation)[:, 1]
    test_probabilities = model.predict_proba(X_test)[:, 1]
    selected_threshold = choose_threshold_f1(y_validation, validation_probabilities)
    test_metrics = evaluate(y_test, test_probabilities, selected_threshold)
    test_metrics_at_half = evaluate(y_test, test_probabilities, 0.5)
    validation_metrics = evaluate(y_validation, validation_probabilities, selected_threshold)
    majority_baseline_accuracy = float(max(y_test.mean(), 1 - y_test.mean()))

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(MODEL_FILE))
    metrics = {
        "model_type": "LightGBMClassifier",
        "model_scope": "martech_simulated_click_fraud_benchmark",
        "source_dataset": "MarTech Challenge 10 (simulated click sessions)",
        "label_mapping": {"0": "Normal", "1": "Fraud/cheating"},
        "rows_total": int(n_rows),
        "class_counts": {str(k): int(v) for k, v in ordered_labels.value_counts().sort_index().items()},
        "split": {
            "method": "chronological 70/15/15",
            "train_rows": int(len(X_train)),
            "validation_rows": int(len(X_validation)),
            "test_rows": int(len(X_test)),
            "train_fraud_rate": float(y_train.mean()),
            "validation_fraud_rate": float(y_validation.mean()),
            "test_fraud_rate": float(y_test.mean()),
            "train_date_range_utc": [str(ordered_timestamps.iloc[0]), str(ordered_timestamps.iloc[train_end - 1])],
            "validation_date_range_utc": [str(ordered_timestamps.iloc[train_end]), str(ordered_timestamps.iloc[validation_end - 1])],
            "test_date_range_utc": [str(ordered_timestamps.iloc[validation_end]), str(ordered_timestamps.iloc[-1])],
        },
        "best_iteration": int(model.best_iteration_ or model.n_estimators),
        "threshold_selected_on_validation_by_f1": selected_threshold,
        "test_metrics": test_metrics,
        "test_metrics_threshold_0_5": test_metrics_at_half,
        "validation_metrics_at_selected_threshold": validation_metrics,
        "test_majority_baseline_accuracy": majority_baseline_accuracy,
        "feature_columns": FEATURE_COLUMNS,
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "excluded_columns": ["Unnamed: 0", "sid", "label"],
        "dataset_sha256": sha256_file(DATA_FILE),
        "automation_eligible": False,
        "automation_block_reason": "Model dilatih pada dataset MarTech yang disimulasikan dan memiliki skema yang tidak kompatibel dengan event CPA ClickGuard. Hasil ini hanya benchmark terpisah.",
    }
    metadata = {
        "model_file": MODEL_FILE.name,
        "metrics_file": METRICS_FILE.name,
        "timestamp_origin_ms": timestamp_origin_ms,
        "raw_columns": [
            "android_id", "apptype", "carrier", "dev_height", "dev_ppi", "dev_width",
            "lan", "media_id", "ntt", "os", "osv", "package", "version",
            "fea_hash", "location", "fea1_hash", "cus_type", "timestamp",
        ],
        "feature_columns": FEATURE_COLUMNS,
        "categorical_features": CATEGORICAL_FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "threshold": selected_threshold,
        "automation_eligible": False,
        "dataset_sha256": sha256_file(DATA_FILE),
        "note": "Data asal dinyatakan sebagai simulasi oleh README upstream. Jangan mempromosikan benchmark ini sebagai model live CPA sebelum validasi eksternal click-level pada traffic aktual.",
    }
    status = {
        "status": "benchmark_only",
        "ready_for_prediction": True,
        "automation_eligible": False,
        "reason": metrics["automation_block_reason"],
        "test_metrics": test_metrics,
    }

    METRICS_FILE.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    METADATA_FILE.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    STATUS_FILE.write_text(json.dumps(status, indent=2), encoding="utf-8")

    print(json.dumps({
        "status": status["status"],
        "test_metrics": test_metrics,
        "test_metrics_threshold_0_5": test_metrics_at_half,
        "majority_baseline_accuracy": majority_baseline_accuracy,
        "model_file": str(MODEL_FILE),
        "metrics_file": str(METRICS_FILE),
        "automation_eligible": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, KeyError, ImportError) as exc:
        print(f"TRAINING MARTECH GAGAL: {exc}", file=sys.stderr)
        raise SystemExit(2)
