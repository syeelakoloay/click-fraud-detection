"""Train a separate web-session robot detector from the supplied Web Robot logs.

This model predicts ROBOT (web-session automation), not ad-click fraud. It is
kept separate from the CPA click-fraud model and is never automation eligible.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split

ML_DIR = Path(__file__).resolve().parent
DATA_DIR = ML_DIR / "datasets" / "web_robot_detection"
SIMPLE_FILE = DATA_DIR / "simple_features.csv"
SEMANTIC_FILE = DATA_DIR / "semantic_features.csv"
RESULTS_DIR = ML_DIR / "results"
MODEL_FILE = RESULTS_DIR / "web_robot_lightgbm_model.joblib"
METRICS_FILE = RESULTS_DIR / "web_robot_model_metrics.json"
METADATA_FILE = RESULTS_DIR / "web_robot_model_metadata.json"
CONFUSION_FILE = RESULTS_DIR / "web_robot_confusion_matrix.csv"
REPORT_FILE = RESULTS_DIR / "web_robot_classification_report.csv"
IMPORTANCE_FILE = RESULTS_DIR / "web_robot_feature_importance.csv"
RANDOM_STATE = 42
TEST_SIZE = 0.20

EXCLUDED_FEATURES = ["ID", "ROBOT", "PENALTY", "MAX_BARRAGE"]


def load_dataset() -> tuple[pd.DataFrame, pd.Series]:
    if not SIMPLE_FILE.is_file() or not SEMANTIC_FILE.is_file():
        raise FileNotFoundError(
            "Kedua file simple_features.csv dan semantic_features.csv wajib tersedia "
            f"di {DATA_DIR}."
        )

    simple = pd.read_csv(SIMPLE_FILE, low_memory=False)
    semantic = pd.read_csv(SEMANTIC_FILE, low_memory=False)
    for frame, label in [(simple, "simple_features"), (semantic, "semantic_features")]:
        required = {"ID", "ROBOT"}
        missing = sorted(required - set(frame.columns))
        if missing:
            raise ValueError(f"Kolom wajib {missing} tidak ditemukan di {label}.csv.")
        if frame["ID"].isna().any() or frame["ID"].duplicated().any():
            raise ValueError(f"Kolom ID pada {label}.csv harus terisi dan unik.")
        if frame["ROBOT"].isna().any():
            raise ValueError(f"Label ROBOT pada {label}.csv tidak boleh kosong.")
        labels = set(pd.to_numeric(frame["ROBOT"], errors="raise").astype(int).unique())
        if labels != {0, 1}:
            raise ValueError(f"Label ROBOT pada {label}.csv harus berupa 0 dan 1.")

    simple_labels = simple[["ID", "ROBOT"]].copy()
    semantic_labels = semantic[["ID", "ROBOT"]].copy()
    paired = simple_labels.merge(
        semantic_labels,
        on="ID",
        how="outer",
        suffixes=("_simple", "_semantic"),
        indicator=True,
        validate="one_to_one",
    )
    if not (paired["_merge"] == "both").all():
        raise ValueError("Daftar ID pada dua file Web Robot tidak sama persis.")
    if not (paired["ROBOT_simple"].astype(int) == paired["ROBOT_semantic"].astype(int)).all():
        raise ValueError("Label ROBOT berbeda untuk ID yang sama pada kedua file.")

    semantic_features = semantic.drop(columns=["ROBOT"])
    combined = simple.merge(
        semantic_features,
        on="ID",
        how="inner",
        validate="one_to_one",
        suffixes=("", "_semantic"),
    )
    y = pd.to_numeric(combined.pop("ROBOT"), errors="raise").astype("int8")
    X = combined.drop(columns=[name for name in EXCLUDED_FEATURES if name in combined.columns])
    if X.empty:
        raise ValueError("Tidak ada fitur yang tersisa setelah kolom identifier/label dikeluarkan.")

    # Dataset berisi fitur numerik. Nilai kosong dipertahankan sebagai NaN karena
    # LightGBM dapat mempelajari arah missing-value tanpa imputasi global.
    for column in X.columns:
        X[column] = pd.to_numeric(X[column], errors="coerce")
    all_missing = [column for column in X.columns if X[column].isna().all()]
    if all_missing:
        raise ValueError(f"Fitur sepenuhnya kosong tidak dapat digunakan: {all_missing}")
    X = X.replace([np.inf, -np.inf], np.nan)
    if y.nunique() != 2:
        raise ValueError("Label ROBOT harus memiliki kelas Human (0) dan Robot (1).")
    return X, y


def create_model() -> LGBMClassifier:
    return LGBMClassifier(
        n_estimators=450,
        learning_rate=0.04,
        num_leaves=31,
        max_depth=-1,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        n_jobs=-1,
        verbosity=-1,
        random_state=RANDOM_STATE,
    )


def calculate_metrics(y_true, y_pred, y_probability) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "precision_robot": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall_robot": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_robot": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_probability)),
        "average_precision_robot": float(average_precision_score(y_true, y_probability)),
    }


def main() -> int:
    X, y = load_dataset()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )

    # Cross-validation hanya pada training split. Test split tetap tidak disentuh
    # sampai evaluasi akhir, sehingga metrik test tidak dipakai untuk memilih model.
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    scoring = {
        "accuracy": "accuracy",
        "balanced_accuracy": "balanced_accuracy",
        "precision": "precision",
        "recall": "recall",
        "f1": "f1",
        "roc_auc": "roc_auc",
    }
    cv_result = cross_validate(
        create_model(), X_train, y_train, cv=cv, scoring=scoring,
        n_jobs=1, return_train_score=False,
    )
    cv_metrics = {
        metric: {
            "mean": float(np.mean(cv_result[f"test_{metric}"])),
            "std": float(np.std(cv_result[f"test_{metric}"])),
            "folds": [float(value) for value in cv_result[f"test_{metric}"]],
        }
        for metric in scoring
    }

    model = create_model()
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test).astype("int8")
    y_probability = model.predict_proba(X_test)[:, list(model.classes_).index(1)]
    test_metrics = calculate_metrics(y_test, y_pred, y_probability)
    test_metrics["majority_baseline_accuracy"] = float(
        accuracy_score(y_test, np.full(len(y_test), int(y_train.mode().iloc[0])))
    )
    matrix = confusion_matrix(y_test, y_pred, labels=[0, 1])

    quality_checks = {
        "accuracy_gt_95": test_metrics["accuracy"] > 0.95,
        "precision_robot_gte_90": test_metrics["precision_robot"] >= 0.90,
        "recall_robot_gte_90": test_metrics["recall_robot"] >= 0.90,
        "f1_robot_gte_90": test_metrics["f1_robot"] >= 0.90,
        "roc_auc_gte_90": test_metrics["roc_auc"] >= 0.90,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_FILE)
    pd.DataFrame(
        matrix,
        index=["actual_human", "actual_robot"],
        columns=["predicted_human", "predicted_robot"],
    ).to_csv(CONFUSION_FILE)
    pd.DataFrame(
        classification_report(
            y_test, y_pred, labels=[0, 1], target_names=["Human", "Robot"],
            output_dict=True, zero_division=0,
        )
    ).transpose().to_csv(REPORT_FILE)
    pd.DataFrame({
        "feature": X.columns,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False).to_csv(IMPORTANCE_FILE, index=False)

    counts = y.value_counts().sort_index()
    payload = {
        "model_type": "LightGBMClassifier",
        "model_scope": "web_session_robot_detection",
        "source_dataset": "Web Robot Detection - Server Logs (simple_features + semantic_features)",
        "label_mapping": {"0": "Human/non-robot session", "1": "Robot session"},
        "rows_total": int(len(X)),
        "class_counts": {"human": int(counts.get(0, 0)), "robot": int(counts.get(1, 0))},
        "features": X.columns.tolist(),
        "excluded_features": EXCLUDED_FEATURES,
        "split": {
            "method": "stratified random holdout",
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "training_class_counts": {"human": int((y_train == 0).sum()), "robot": int((y_train == 1).sum())},
            "test_class_counts": {"human": int((y_test == 0).sum()), "robot": int((y_test == 1).sum())},
        },
        "cross_validation_on_training_split": cv_metrics,
        "test_metrics": {**test_metrics, "threshold": 0.5, "rows": int(len(y_test)), "confusion_matrix": matrix.tolist()},
        "quality_checks": quality_checks,
        "meets_robot_model_quality_gate": bool(all(quality_checks.values())),
        "automation_eligible": False,
        "fraud_click_classifier": False,
        "warning": (
            "Metrik ini hanya mengukur klasifikasi sesi Human/Robot pada dataset Web Robot. "
            "Label Robot tidak sama dengan Fraud klik iklan; model terpisah dan tidak boleh "
            "menjadi dasar auto-block atau menggantikan model CPA."
        ),
    }
    METRICS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    METADATA_FILE.write_text(json.dumps({
        "model_file": MODEL_FILE.name,
        "model_scope": payload["model_scope"],
        "feature_columns": X.columns.tolist(),
        "label_mapping": payload["label_mapping"],
        "test_metrics": payload["test_metrics"],
        "cross_validation_on_training_split": cv_metrics,
        "automation_eligible": False,
        "fraud_click_classifier": False,
    }, indent=2), encoding="utf-8")

    print("Evaluasi Web Robot Detection selesai.")
    print(f"Rows: {len(X)} | Train: {len(X_train)} | Test: {len(X_test)}")
    print("Test metrics:")
    for name, value in test_metrics.items():
        print(f"  {name}: {value:.6f} ({value * 100:.2f}%)")
    print("5-fold CV (training split):")
    for name, value in cv_metrics.items():
        print(f"  {name}: {value['mean']:.6f} +/- {value['std']:.6f}")
    print(f"Quality gate robot model: {'PASS' if all(quality_checks.values()) else 'NOT MET'}")
    print("Status auto-block: DISABLED (robot-session model is not click-fraud model).")
    print(f"Model saved: {MODEL_FILE}")
    print(f"Metrics saved: {METRICS_FILE}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, KeyError) as exc:
        print(f"TRAINING WEB ROBOT DITOLAK: {exc}", file=sys.stderr)
        raise SystemExit(2)
