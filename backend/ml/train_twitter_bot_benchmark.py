"""Train an isolated social-account bot benchmark; never a click-fraud model."""
from __future__ import annotations
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ML_DIR = Path(__file__).resolve().parent
DATA_FILE = ML_DIR / "datasets" / "twitter_bot" / "twitter_human_bots_dataset.csv"
RESULTS_DIR = ML_DIR / "results"
MODEL_FILE = RESULTS_DIR / "twitter_bot_benchmark_model.joblib"
METRICS_FILE = RESULTS_DIR / "twitter_bot_benchmark_metrics.json"
RANDOM_STATE = 42

EXCLUDED = ["", "Unnamed: 0", "created_at", "description", "id", "location", "profile_background_image_url", "profile_image_url", "screen_name", "account_type"]


def main() -> int:
    if not DATA_FILE.is_file():
        raise FileNotFoundError(f"Dataset tidak ditemukan: {DATA_FILE}")
    frame = pd.read_csv(DATA_FILE, low_memory=False)
    if "account_type" not in frame:
        raise ValueError("Kolom account_type tidak ditemukan.")
    y = frame["account_type"].astype(str).str.strip().str.lower().map({"human": 0, "bot": 1})
    if y.isna().any() or set(y.unique()) != {0, 1}:
        raise ValueError("account_type harus berisi label human dan bot saja.")
    X = frame.drop(columns=[column for column in EXCLUDED if column in frame.columns]).copy()
    # Convert common boolean strings and numeric-looking fields deterministically.
    for column in X.columns:
        if X[column].dtype == "object":
            normalized = X[column].dropna().astype(str).str.strip().str.lower()
            if set(normalized.unique()) <= {"true", "false"}:
                X[column] = X[column].astype(str).str.strip().str.lower().map({"true": 1, "false": 0})
            else:
                numeric = pd.to_numeric(X[column], errors="coerce")
                if numeric.notna().mean() >= 0.95:
                    X[column] = numeric
    numeric_features = X.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_features = X.select_dtypes(exclude=["number", "bool"]).columns.tolist()
    transformers = []
    if numeric_features:
        transformers.append(("numeric", Pipeline([("imputer", SimpleImputer(strategy="median"))]), numeric_features))
    if categorical_features:
        transformers.append(("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical_features))
    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    estimator = LGBMClassifier(
        n_estimators=450, learning_rate=0.04, num_leaves=31, max_depth=-1,
        subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0,
        n_jobs=-1, verbosity=-1, random_state=RANDOM_STATE,
    )
    model = Pipeline([("preprocessor", preprocessor), ("classifier", estimator)])
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=RANDOM_STATE
    )
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    probability = model.predict_proba(X_test)[:, list(model.classes_).index(1)]
    metrics = {
        "accuracy": float(accuracy_score(y_test, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, pred)),
        "precision_bot": float(precision_score(y_test, pred, zero_division=0)),
        "recall_bot": float(recall_score(y_test, pred, zero_division=0)),
        "f1_bot": float(f1_score(y_test, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probability)),
        "rows_test": int(len(y_test)),
        "confusion_matrix": confusion_matrix(y_test, pred, labels=[0, 1]).tolist(),
    }
    payload = {
        "model_type": "LightGBMClassifier pipeline",
        "model_scope": "social_media_account_bot_benchmark",
        "source_dataset": "Twitter Human Bots Detection",
        "label_mapping": {"0": "human account", "1": "bot account"},
        "rows_total": int(len(frame)),
        "rows_train": int(len(X_train)),
        "rows_test": int(len(X_test)),
        "feature_columns": X.columns.tolist(),
        "excluded_columns": EXCLUDED,
        "test_metrics": metrics,
        "automation_eligible": False,
        "fraud_click_classifier": False,
        "reason": "Unit analisis adalah akun Twitter, bukan klik atau sesi iklan. Benchmark ini tidak terhubung ke API prediksi ClickGuard.",
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)
    METRICS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print("Twitter bot benchmark selesai (terpisah dari click-fraud).")
    for name, value in metrics.items():
        if isinstance(value, float): print(f"{name}: {value:.6f} ({value * 100:.2f}%)")
    print("automation_eligible: false")
    print(f"Model: {MODEL_FILE}")
    print(f"Metrics: {METRICS_FILE}")
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except (ValueError, FileNotFoundError) as exc:
        print(f"TRAINING TWITTER BENCHMARK DITOLAK: {exc}", file=sys.stderr)
        raise SystemExit(2)
