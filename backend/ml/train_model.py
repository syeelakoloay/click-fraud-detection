from pathlib import Path

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
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


# ==========================================
# 1. PENGATURAN FILE
# ==========================================

ML_DIR = Path(__file__).resolve().parent
RESULTS_DIR = ML_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

DATA_FILE = ML_DIR / "click_fraud_features.csv"
MODEL_FILE = RESULTS_DIR / "random_forest_model.joblib"
METRICS_FILE = RESULTS_DIR / "model_metrics.csv"
CONFUSION_FILE = RESULTS_DIR / "confusion_matrix.csv"
REPORT_FILE = RESULTS_DIR / "classification_report.csv"

TARGET = "is_fraudulent"


def main():
    # ==========================================
    # 2. MEMBACA DAN MEMERIKSA DATASET
    # ==========================================

    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Dataset tidak ditemukan: {DATA_FILE}"
        )

    df = pd.read_csv(DATA_FILE)

    if df.empty:
        raise ValueError("Dataset kosong.")

    if TARGET not in df.columns:
        raise ValueError(
            f"Kolom target '{TARGET}' tidak ditemukan."
        )

    if df[TARGET].isna().any():
        raise ValueError(
            "Kolom target memiliki nilai kosong."
        )

    y = pd.to_numeric(
        df[TARGET], errors="raise"
    ).astype(int)

    if set(y.unique()) != {0, 1}:
        raise ValueError(
            "Target harus memiliki label 0 (non-fraud) "
            "dan 1 (fraud)."
        )

    X = df.drop(columns=[TARGET])

    # Keluarkan identifier mentah dan kolom yang belum
    # diputuskan aman untuk digunakan sebagai fitur.
    excluded_columns = [
        "click_id",
        "user_id",
        "ip_address",
        "timestamp",
        "referrer_url",
        "page_url",
        "bot_likelihood_score",
    ]

    columns_to_remove = [
        col for col in excluded_columns if col in X.columns
    ]

    if columns_to_remove:
        print("Kolom yang dikecualikan:", columns_to_remove)
        X = X.drop(columns=columns_to_remove)

    if X.shape[1] == 0:
        raise ValueError(
            "Tidak ada fitur input yang dapat digunakan."
        )

    # ==========================================
    # 3. MEMISAHKAN FITUR NUMERIK DAN KATEGORIKAL
    # ==========================================

    numeric_features = X.select_dtypes(
        include=["number"]
    ).columns.tolist()

    categorical_features = X.select_dtypes(
        exclude=["number"]
    ).columns.tolist()

    transformers = []

    if numeric_features:
        numeric_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="median"))
        ])

        transformers.append((
            "numeric",
            numeric_pipeline,
            numeric_features,
        ))

    if categorical_features:
        categorical_pipeline = Pipeline([
            (
                "imputer",
                SimpleImputer(strategy="most_frequent"),
            ),
            (
                "onehot",
                OneHotEncoder(handle_unknown="ignore"),
            ),
        ])

        transformers.append((
            "categorical",
            categorical_pipeline,
            categorical_features,
        ))

    preprocessor = ColumnTransformer(
        transformers=transformers,
        remainder="drop",
    )

    # ==========================================
    # 4. MEMBAGI DATA TRAINING DAN TESTING
    # ==========================================

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    # ==========================================
    # 5. MEMBUAT DAN MELATIH RANDOM FOREST
    # ==========================================

    model = Pipeline([
        ("preprocessor", preprocessor),
        (
            "classifier",
            RandomForestClassifier(
                n_estimators=200,
                random_state=42,
                class_weight="balanced",
                n_jobs=-1,
            ),
        ),
    ])

    print("\nMemulai training Random Forest...")
    model.fit(X_train, y_train)

    # ==========================================
    # 6. PREDIKSI DATA TESTING
    # ==========================================

    y_pred = model.predict(X_test)

    classifier = model.named_steps["classifier"]
    fraud_index = list(classifier.classes_).index(1)

    y_score = model.predict_proba(X_test)[:, fraud_index]

    # ==========================================
    # 7. LIMA METRIK EVALUASI
    # ==========================================

    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(
            y_test, y_pred, pos_label=1, zero_division=0
        ),
        "recall": recall_score(
            y_test, y_pred, pos_label=1, zero_division=0
        ),
        "f1_score": f1_score(
            y_test, y_pred, pos_label=1, zero_division=0
        ),
        "roc_auc": roc_auc_score(y_test, y_score),
    }

    # ==========================================
    # 8. CONFUSION MATRIX
    # ==========================================

    cm = confusion_matrix(
        y_test, y_pred, labels=[0, 1]
    )

    cm_df = pd.DataFrame(
        cm,
        index=["Actual_Non_Fraud", "Actual_Fraud"],
        columns=["Predicted_Non_Fraud", "Predicted_Fraud"],
    )

    print("\n=== CONFUSION MATRIX ===")
    print("Baris = label aktual; kolom = hasil prediksi")
    print("Label 0 = Non-fraud; label 1 = Fraud")
    print(cm_df.to_string())

    # ==========================================
    # 9. CLASSIFICATION REPORT
    # ==========================================

    report_dict = classification_report(
        y_test,
        y_pred,
        labels=[0, 1],
        target_names=["Non-fraud", "Fraud"],
        output_dict=True,
        zero_division=0,
    )

    print("\n=== CLASSIFICATION REPORT ===")
    print(classification_report(
        y_test,
        y_pred,
        labels=[0, 1],
        target_names=["Non-fraud", "Fraud"],
        zero_division=0,
    ))

    # ==========================================
    # 10. BASELINE ACCURACY UNTUK PEMBANDING
    # ==========================================

    majority_class = y_train.mode().iloc[0]

    baseline_pred = [majority_class] * len(y_test)
    baseline_accuracy = accuracy_score(y_test, baseline_pred)

    print("\n=== RINGKASAN TRAINING ===")
    print(f"Jumlah data        : {len(df)}")
    print(f"Jumlah fitur input : {X.shape[1]}")
    print(f"Data training      : {len(X_train)}")
    print(f"Data testing       : {len(X_test)}")
    print(f"Jumlah fraud       : {(y == 1).sum()}")
    print(f"Jumlah non-fraud   : {(y == 0).sum()}")

    print("\n=== METRIK EVALUASI ===")
    for name, value in metrics.items():
        print(
            f"{name.replace('_', ' ').title():12s}: "
            f"{value:.4f} ({value * 100:.2f}%)"
        )

    print(
        f"\nBaseline accuracy : {baseline_accuracy:.4f} "
        f"({baseline_accuracy * 100:.2f}%)"
    )

    # ==========================================
    # 11. MENYIMPAN MODEL DAN HASIL
    # ==========================================

    joblib.dump(model, MODEL_FILE)

    pd.DataFrame([metrics]).to_csv(
        METRICS_FILE, index=False
    )

    cm_df.to_csv(CONFUSION_FILE)

    pd.DataFrame(report_dict).transpose().to_csv(
        REPORT_FILE, index=True
    )

    print("\n=== FILE OUTPUT ===")
    print(f"Model tersimpan       : {MODEL_FILE}")
    print(f"Metrik tersimpan      : {METRICS_FILE}")
    print(f"Confusion matrix      : {CONFUSION_FILE}")
    print(f"Classification report : {REPORT_FILE}")
    print("\nTraining dan evaluasi selesai.")


if __name__ == "__main__":
    main()
