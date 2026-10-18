from pathlib import Path
import sys
import warnings

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report,
    make_scorer,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ======================================================
# KONFIGURASI FILE
# ======================================================
ML_DIR = Path(__file__).resolve().parent
RESULTS_DIR = ML_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

DATA_FILE = ML_DIR / "click_fraud_features.csv"
BASELINE_METRICS_FILE = RESULTS_DIR / "model_metrics.csv"
MODEL_FILE = RESULTS_DIR / "tuned_random_forest_model.joblib"
METRICS_FILE = RESULTS_DIR / "tuned_model_metrics.csv"
CONFUSION_FILE = RESULTS_DIR / "tuned_confusion_matrix.csv"
REPORT_FILE = RESULTS_DIR / "tuned_classification_report.csv"
CV_FILE = RESULTS_DIR / "random_forest_tuning_cv.csv"
COMPARISON_FILE = RESULTS_DIR / "model_comparison_baseline_vs_tuned.csv"
TARGET = "is_fraudulent"


def main() -> int:
    if not DATA_FILE.exists():
        print(f"ERROR: Dataset tidak ditemukan: {DATA_FILE}")
        return 1

    df = pd.read_csv(DATA_FILE)
    if df.empty or TARGET not in df.columns:
        print("ERROR: Dataset kosong atau kolom target tidak ditemukan.")
        return 1
    if df[TARGET].isna().any():
        print("ERROR: Kolom target memiliki nilai kosong.")
        return 1

    y = pd.to_numeric(df[TARGET], errors="raise").astype(int)
    if set(y.unique()) != {0, 1}:
        print("ERROR: Target harus hanya berisi label 0 dan 1.")
        return 1

    # Tetap mengecualikan identifier, URL mentah, timestamp mentah,
    # dan bot_likelihood_score sampai asal-usul skornya terverifikasi.
    excluded = [
        "click_id", "user_id", "ip_address", "timestamp",
        "referrer_url", "page_url", "bot_likelihood_score",
    ]
    X = df.drop(columns=[TARGET] + [col for col in excluded if col in df.columns])
    if X.shape[1] == 0:
        print("ERROR: Tidak ada fitur input yang dapat digunakan.")
        return 1

    numeric_features = X.select_dtypes(include=["number"]).columns.tolist()
    categorical_features = X.select_dtypes(exclude=["number"]).columns.tolist()

    transformers = []
    if numeric_features:
        transformers.append((
            "numeric",
            Pipeline([("imputer", SimpleImputer(strategy="median"))]),
            numeric_features,
        ))
    if categorical_features:
        transformers.append((
            "categorical",
            Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore")),
            ]),
            categorical_features,
        ))

    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    # Baseline sederhana: selalu memprediksi kelas mayoritas pada training.
    majority_class = int(y_train.mode().iloc[0])
    majority_predictions = [majority_class] * len(y_test)
    majority_accuracy = accuracy_score(y_test, majority_predictions)

    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(random_state=42, n_jobs=1)),
    ])

    # 16 kombinasi parameter. Cross-validation hanya dilakukan pada data training.
    param_grid = {
        "classifier__n_estimators": [100, 200],
        "classifier__max_depth": [None, 10],
        "classifier__min_samples_leaf": [1, 5],
        "classifier__class_weight": [None, "balanced"],
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    # zero_division=0 menghindari warning ketika model tidak memprediksi kelas fraud.
    scoring = {
        "accuracy": "accuracy",
        "precision": make_scorer(precision_score, pos_label=1, zero_division=0),
        "recall": make_scorer(recall_score, pos_label=1, zero_division=0),
        "f1": make_scorer(f1_score, pos_label=1, zero_division=0),
        "roc_auc": "roc_auc",
    }
    search = GridSearchCV(
        estimator=pipeline,
        param_grid=param_grid,
        scoring=scoring,
        # Untuk deteksi fraud, pilih konfigurasi dari F1 cross-validation,
        # bukan accuracy saja yang dapat mengutamakan kelas mayoritas.
        refit="f1",
        cv=cv,
        n_jobs=1,
        verbose=1,
        return_train_score=False,
    )

    print("\n=== EKSPERIMEN TUNING RANDOM FOREST ===")
    print(f"Dataset: {len(df)} baris; fitur input sebelum encoding: {X.shape[1]}")
    print(f"Training: {len(X_train)}; testing: {len(X_test)}")
    print(f"Baseline accuracy (kelas mayoritas): {majority_accuracy:.4f} ({majority_accuracy * 100:.2f}%)")
    print("Menguji 16 kombinasi parameter dengan 5-fold cross-validation pada data training...")
    print("Kriteria pemilihan model: F1-score, agar deteksi kelas fraud ikut diperhatikan.")
    search.fit(X_train, y_train)

    cv_results = pd.DataFrame(search.cv_results_)
    keep_cols = [
        "rank_test_accuracy", "mean_test_accuracy", "std_test_accuracy",
        "rank_test_f1", "mean_test_precision", "mean_test_recall",
        "mean_test_f1", "mean_test_roc_auc", "params",
    ]
    cv_results[keep_cols].sort_values(
        ["rank_test_f1", "rank_test_accuracy"]
    ).to_csv(CV_FILE, index=False)

    best_model = search.best_estimator_
    y_pred = best_model.predict(X_test)
    classifier = best_model.named_steps["classifier"]
    fraud_idx = list(classifier.classes_).index(1)
    y_score = best_model.predict_proba(X_test)[:, fraud_idx]

    best_cv_accuracy = float(search.cv_results_["mean_test_accuracy"][search.best_index_])
    metrics = {
        "majority_baseline_accuracy": majority_accuracy,
        "best_cv_accuracy_for_selected_model": best_cv_accuracy,
        "best_cv_f1_for_selected_model": float(search.best_score_),
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, pos_label=1, zero_division=0),
        "recall": recall_score(y_test, y_pred, pos_label=1, zero_division=0),
        "f1_score": f1_score(y_test, y_pred, pos_label=1, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_score),
    }

    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])
    cm_df = pd.DataFrame(
        cm,
        index=["Actual_Non_Fraud", "Actual_Fraud"],
        columns=["Predicted_Non_Fraud", "Predicted_Fraud"],
    )
    report_dict = classification_report(
        y_test, y_pred,
        labels=[0, 1],
        target_names=["Non-fraud", "Fraud"],
        output_dict=True,
        zero_division=0,
    )
    # DataFrame(report_dict).transpose() aman untuk nilai accuracy yang berupa scalar.
    report = pd.DataFrame(report_dict).transpose()

    joblib.dump(best_model, MODEL_FILE)
    pd.DataFrame([metrics]).to_csv(METRICS_FILE, index=False)
    cm_df.to_csv(CONFUSION_FILE)
    report.to_csv(REPORT_FILE, index=True)

    # Bandingkan model baseline tersimpan dan model tuned pada split data testing yang sama.
    comparison_rows = []
    if BASELINE_METRICS_FILE.exists():
        try:
            old_metrics = pd.read_csv(BASELINE_METRICS_FILE)
            if not old_metrics.empty:
                row = old_metrics.iloc[0]
                comparison_rows.append({
                    "model": "Random Forest baseline",
                    **{metric: row.get(metric, float("nan")) for metric in
                       ["accuracy", "precision", "recall", "f1_score", "roc_auc"]},
                })
        except Exception as exc:
            print(f"Catatan: metrik baseline tidak dapat dibaca untuk perbandingan: {exc}")
    comparison_rows.append({
        "model": "Random Forest tuned (dipilih berdasarkan CV F1)",
        **{metric: metrics[metric] for metric in
           ["accuracy", "precision", "recall", "f1_score", "roc_auc"]},
    })
    pd.DataFrame(comparison_rows).to_csv(COMPARISON_FILE, index=False)

    print("\n=== PARAMETER TERPILIH BERDASARKAN CV F1 ===")
    print(search.best_params_)
    print(f"Best mean CV F1: {search.best_score_:.4f} ({search.best_score_ * 100:.2f}%)")
    print(f"Mean CV accuracy model terpilih: {best_cv_accuracy:.4f} ({best_cv_accuracy * 100:.2f}%)")

    print("\n=== EVALUASI AKHIR PADA DATA TESTING ===")
    for name in ["accuracy", "precision", "recall", "f1_score", "roc_auc"]:
        value = metrics[name]
        print(f"{name:12s}: {value:.4f} ({value * 100:.2f}%)")
    print(f"Baseline accuracy kelas mayoritas: {majority_accuracy:.4f} ({majority_accuracy * 100:.2f}%)")

    print("\n=== CONFUSION MATRIX ===")
    print("Baris = label aktual; kolom = hasil prediksi")
    print(cm_df.to_string())

    print("\n=== FILE OUTPUT ===")
    for label, path in [
        ("CV tuning", CV_FILE),
        ("Model terpilih", MODEL_FILE),
        ("Metrik", METRICS_FILE),
        ("Confusion matrix", CONFUSION_FILE),
        ("Classification report", REPORT_FILE),
        ("Perbandingan model", COMPARISON_FILE),
    ]:
        print(f"{label:22s}: {path}")
    print("\nEksperimen selesai. Model baseline lama tidak ditimpa.")
    print("Catatan: eksperimen ini tidak menjamin Accuracy >95%; laporkan hasil aktual.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"\nERROR: Eksperimen gagal: {exc}")
        raise
