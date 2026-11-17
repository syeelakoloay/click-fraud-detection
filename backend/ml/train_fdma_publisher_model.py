"""Train an independent publisher-level fraud model from the FDMA 2012 BuzzCity data.

The FDMA source labels publishers, not individual clicks. This script aggregates
click logs to publisher features and evaluates official validation/test periods.
No bot_likelihood_score or publisher identifier is used as a predictor.
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
DATA_DIR = ML_DIR.parent / "dataset" / "fdma2012"
RESULTS_DIR = ML_DIR / "results"

FILE_MAP = {
    "train": ("train_clicks.csv", "train_publishers.csv"),
    "validation": ("validation_clicks.csv", "validation_publishers.csv"),
    "test": ("test_clicks.csv", "test_publishers.csv"),
}

NUMERIC_FEATURES = [
    "click_count", "unique_ip_count", "unique_device_count", "unique_campaign_count",
    "unique_country_count", "unique_channel_count", "clicks_per_ip_mean",
    "clicks_per_ip_max", "clicks_per_ip_std", "unique_ip_ratio",
    "max_ip_share", "peak_hour_share", "hour_entropy", "missing_referrer_ratio",
    "clicks_per_day_mean", "clicks_per_day_std",
]
CATEGORICAL_FEATURES = ["primary_channel", "primary_country"]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES

ALIASES = {
    "publisher_id": ["publisherid", "publisher_id", "publisher"],
    "status": ["status", "publisher_status"],
    "click_id": ["id", "clickid", "click_id"],
    "ip": ["numericip", "ip", "ip_address", "ipaddress"],
    "device": ["deviceua", "device_ua", "ua", "device"],
    "campaign": ["adscampaignid", "campaignid", "campaign_id", "ad_campaign_id"],
    "country": ["usercountry", "country", "user_country"],
    "click_time": ["clicktime", "click_time", "timestamp", "date"],
    "channel": ["publisherchannel", "publisher_channel", "channel"],
    "referrer": ["referredurl", "referred_url", "referrer", "referrer_url"],
}


def normalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    lookup = {"".join(ch for ch in str(col).lower() if ch.isalnum()): col for col in frame.columns}
    rename = {}
    for canonical, aliases in ALIASES.items():
        for alias in aliases:
            key = "".join(ch for ch in alias.lower() if ch.isalnum())
            if key in lookup:
                rename[lookup[key]] = canonical
                break
    return frame.rename(columns=rename)


def load_split(split: str) -> pd.DataFrame:
    click_name, publisher_name = FILE_MAP[split]
    click_path = DATA_DIR / click_name
    publisher_path = DATA_DIR / publisher_name
    if not click_path.exists() or not publisher_path.exists():
        raise FileNotFoundError(f"File {split} belum lengkap. Diperlukan {click_path.name} dan {publisher_path.name}.")
    clicks = normalize_columns(pd.read_csv(click_path, low_memory=False))
    publishers = normalize_columns(pd.read_csv(publisher_path, low_memory=False))
    for frame, required, label in [
        (clicks, ["publisher_id", "ip", "device", "campaign", "country", "click_time", "channel", "referrer"], "click"),
        (publishers, ["publisher_id", "status"], "publisher"),
    ]:
        missing = [column for column in required if column not in frame.columns]
        if missing:
            raise ValueError(f"Kolom {label} {split} tidak ditemukan: {', '.join(missing)}")
    if publishers["publisher_id"].duplicated().any():
        raise ValueError(f"publisher_id duplikat di {publisher_name}.")
    return build_publisher_features(clicks, publishers, split)


def _entropy(values: pd.Series) -> float:
    counts = values.value_counts(normalize=True)
    if counts.empty:
        return 0.0
    return float(-(counts * np.log2(counts)).sum())


def build_publisher_features(clicks: pd.DataFrame, publishers: pd.DataFrame, split: str) -> pd.DataFrame:
    clicks = clicks.copy()
    clicks["click_time"] = pd.to_datetime(clicks["click_time"], errors="coerce", utc=True)
    if clicks["click_time"].isna().any():
        raise ValueError(f"Ada timestamp click invalid pada split {split}.")
    clicks["hour"] = clicks["click_time"].dt.hour
    clicks["day"] = clicks["click_time"].dt.floor("D").astype(str)
    for col in ["ip", "device", "campaign", "country", "channel", "referrer"]:
        clicks[col] = clicks[col].fillna("").astype(str).str.strip()

    groups = []
    for publisher_id, group in clicks.groupby("publisher_id", sort=False, dropna=False):
        count = len(group)
        ip_counts = group.loc[group["ip"] != "", "ip"].value_counts()
        day_counts = group["day"].value_counts()
        hour_counts = group["hour"].value_counts(normalize=True)
        country_counts = group.loc[group["country"] != "", "country"].value_counts()
        channel_counts = group.loc[group["channel"] != "", "channel"].value_counts()
        groups.append({
            "publisher_id": str(publisher_id),
            "click_count": count,
            "unique_ip_count": int(group.loc[group["ip"] != "", "ip"].nunique()),
            "unique_device_count": int(group.loc[group["device"] != "", "device"].nunique()),
            "unique_campaign_count": int(group.loc[group["campaign"] != "", "campaign"].nunique()),
            "unique_country_count": int(group.loc[group["country"] != "", "country"].nunique()),
            "unique_channel_count": int(group.loc[group["channel"] != "", "channel"].nunique()),
            "clicks_per_ip_mean": float(ip_counts.mean()) if len(ip_counts) else 0.0,
            "clicks_per_ip_max": int(ip_counts.max()) if len(ip_counts) else 0,
            "clicks_per_ip_std": float(ip_counts.std(ddof=0)) if len(ip_counts) else 0.0,
            "unique_ip_ratio": float(len(ip_counts) / count) if count else 0.0,
            "max_ip_share": float(ip_counts.max() / count) if len(ip_counts) and count else 0.0,
            "peak_hour_share": float(hour_counts.max()) if len(hour_counts) else 0.0,
            "hour_entropy": _entropy(group["hour"]),
            "missing_referrer_ratio": float((group["referrer"] == "").mean()),
            "clicks_per_day_mean": float(day_counts.mean()) if len(day_counts) else 0.0,
            "clicks_per_day_std": float(day_counts.std(ddof=0)) if len(day_counts) else 0.0,
            "primary_channel": str(channel_counts.index[0]) if len(channel_counts) else "UNKNOWN",
            "primary_country": str(country_counts.index[0]) if len(country_counts) else "UNKNOWN",
        })
    features = pd.DataFrame(groups)
    labels = publishers[["publisher_id", "status"]].copy()
    labels["publisher_id"] = labels["publisher_id"].astype(str)
    labels["status"] = labels["status"].astype(str).str.strip().str.lower()
    merged = labels.merge(features, on="publisher_id", how="left", validate="one_to_one")
    missing_features = int(merged["click_count"].isna().sum())
    merged = merged.dropna(subset=["click_count"]).copy()
    merged["source_status"] = merged["status"]
    merged = merged[merged["status"].isin(["fraud", "ok"])].copy()  # Observation is unknown, not clean.
    merged["target_fraud"] = (merged["status"] == "fraud").astype(int)
    merged["split"] = split
    merged["publisher_features_missing_count"] = missing_features
    return merged


def create_model() -> Pipeline:
    transformer = ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median"))]), NUMERIC_FEATURES),
        ("categorical", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), CATEGORICAL_FEATURES),
    ], remainder="drop")
    return Pipeline([
        ("preprocessor", transformer),
        ("classifier", RandomForestClassifier(n_estimators=500, min_samples_leaf=2, max_features="sqrt", class_weight="balanced_subsample", random_state=42, n_jobs=-1)),
    ])


def find_threshold(y_true, probabilities) -> float:
    candidates = np.linspace(0.05, 0.95, 91)
    scored = [(f1_score(y_true, probabilities >= threshold, zero_division=0), threshold) for threshold in candidates]
    # Tie-break toward higher precision, then toward the conservative larger threshold.
    best_f1 = max(item[0] for item in scored)
    return max(threshold for score, threshold in scored if score == best_f1)


def evaluate(y_true, probabilities, threshold):
    predictions = (probabilities >= threshold).astype(int)
    result = {
        "accuracy": float(accuracy_score(y_true, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, predictions)),
        "precision_fraud": float(precision_score(y_true, predictions, zero_division=0)),
        "recall_fraud": float(recall_score(y_true, predictions, zero_division=0)),
        "f1_fraud": float(f1_score(y_true, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "average_precision": float(average_precision_score(y_true, probabilities)),
        "threshold": float(threshold),
        "rows": int(len(y_true)),
        "fraud_publishers": int((y_true == 1).sum()),
        "ok_publishers": int((y_true == 0).sum()),
    }
    return result, predictions


def main() -> int:
    try:
        train = load_split("train")
        validation = load_split("validation")
        test = load_split("test")
    except FileNotFoundError as exc:
        print("FDMA 2012 DATASET BELUM LENGKAP.")
        print(exc)
        print(f"Lihat panduan: {DATA_DIR / 'README.md'}")
        return 2

    for name, frame in [("train", train), ("validation", validation), ("test", test)]:
        if frame.empty or frame["target_fraud"].nunique() != 2:
            raise ValueError(f"Split {name} harus memuat publisher Fraud dan OK setelah status Observation dikecualikan.")
    # Do not use publisher_id, bank account, address, status, or any bot-score field as predictors.
    X_train = train[FEATURES]
    y_train = train["target_fraud"]
    model = create_model()
    model.fit(X_train, y_train)
    val_scores = model.predict_proba(validation[FEATURES])[:, list(model.classes_).index(1)]
    threshold = find_threshold(validation["target_fraud"], val_scores)
    val_metrics, val_pred = evaluate(validation["target_fraud"], val_scores, threshold)
    test_scores = model.predict_proba(test[FEATURES])[:, list(model.classes_).index(1)]
    test_metrics, test_pred = evaluate(test["target_fraud"], test_scores, threshold)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = RESULTS_DIR / "fdma_publisher_random_forest_model.joblib"
    metrics_path = RESULTS_DIR / "fdma_publisher_model_metrics.json"
    report_path = RESULTS_DIR / "fdma_publisher_test_classification_report.csv"
    confusion_path = RESULTS_DIR / "fdma_publisher_test_confusion_matrix.csv"
    joblib.dump(model, model_path)
    payload = {
        "model_type": "RandomForestClassifier",
        "data_level": "publisher-level from click-log aggregations",
        "label_source": "BuzzCity publisher.status (Fraud vs OK); Observation excluded",
        "label_independent_of_bot_likelihood_score": True,
        "training_split": {"rows": int(len(train)), "fraud": int(train.target_fraud.sum()), "ok": int((train.target_fraud == 0).sum())},
        "validation_metrics": val_metrics,
        "test_metrics": test_metrics,
        "selected_threshold_from_validation_only": threshold,
        "features": FEATURES,
        "excluded_columns": ["publisher_id", "status", "bankaccount", "address", "bot_likelihood_score"],
        "warning": "The model flags publishers, not individual clicks. Performance is dataset/time-period specific; it is not a guarantee of >95% accuracy or direct Google Ads campaign control.",
    }
    metrics_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    pd.DataFrame(confusion_matrix(test["target_fraud"], test_pred, labels=[0, 1]), index=["actual_ok", "actual_fraud"], columns=["pred_ok", "pred_fraud"]).to_csv(confusion_path)
    pd.DataFrame(classification_report(test["target_fraud"], test_pred, labels=[0, 1], target_names=["OK", "Fraud"], output_dict=True, zero_division=0)).transpose().to_csv(report_path)
    print(json.dumps(payload, indent=2))
    print(f"Model disimpan: {model_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError) as exc:
        print(f"TRAINING FDMA GAGAL: {exc}", file=sys.stderr)
        raise SystemExit(2)
