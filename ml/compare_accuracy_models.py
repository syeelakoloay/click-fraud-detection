
from pathlib import Path

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)
from sklearn.model_selection import (
    GridSearchCV,
    StratifiedKFold,
    cross_val_score,
    train_test_split,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.tree import DecisionTreeClassifier


# =========================================================
# 1. LOKASI DATASET DAN FOLDER HASIL
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
RESULTS_DIR = BASE_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

DATA_FILE = BASE_DIR / "click_fraud_features.csv"
TARGET = "is_fraudulent"

if not DATA_FILE.exists():
    raise FileNotFoundError(
        f"Dataset tidak ditemukan: {DATA_FILE}\n"
        "Pastikan click_fraud_features.csv berada di folder ml."
    )

df = pd.read_csv(DATA_FILE)

if TARGET not in df.columns:
    raise ValueError(f"Kolom target '{TARGET}' tidak ditemukan.")

excluded_columns = [
    "click_id",
    "user_id",
    "ip_address",
    "timestamp",
    "referrer_url",
    "page_url",
    "bot_likelihood_score",
]

X = df.drop(
    columns=[TARGET] + [
        col for col in excluded_columns if col in df.columns
    ]
)
y = df[TARGET]

if y.nunique() != 2:
    raise ValueError("Target harus memiliki dua kelas: fraud dan valid.")

# Pastikan kelas target berupa 0 dan 1.
if set(y.unique()) != {0, 1}:
    raise ValueError("Target is_fraudulent harus menggunakan label 0 dan 1.")

# Pembagian data tetap sama seperti eksperimen sebelumnya.
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y,
)


# =========================================================
# 2. PREPROCESSING FITUR
# =========================================================

numeric_cols = X.select_dtypes(
    include=["number", "bool"]
).columns.tolist()

categorical_cols = X.select_dtypes(
    exclude=["number", "bool"]
).columns.tolist()

transformers = []

if numeric_cols:
    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
    ])
    transformers.append(
        ("numeric", numeric_pipeline, numeric_cols)
    )

if categorical_cols:
    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])
    transformers.append(
        ("categorical", categorical_pipeline, categorical_cols)
    )

preprocessor = ColumnTransformer(transformers=transformers)


# =========================================================
# 3. MODEL DAN PARAMETER EKSPERIMEN
# =========================================================

model_specs = [
    (
        "Dummy Classifier (Baseline Kelas Mayoritas)",
        DummyClassifier(strategy="most_frequent"),
        None,
    ),
    (
        "Logistic Regression",
        LogisticRegression(
            max_iter=2000,
            solver="liblinear",
            random_state=42,
        ),
        {
            "classifier__C": [0.1, 1, 10],
            "classifier__class_weight": [None, "balanced"],
        },
    ),
    (
        "Decision Tree",
        DecisionTreeClassifier(random_state=42),
        {
            "classifier__max_depth": [5, 10, None],
            "classifier__min_samples_leaf": [1, 5],
            "classifier__class_weight": [None, "balanced"],
        },
    ),
    (
        "Random Forest",
        RandomForestClassifier(
            random_state=42,
            n_jobs=1,
        ),
        {
            "classifier__n_estimators": [100],
            "classifier__max_depth": [None, 10],
            "classifier__min_samples_leaf": [1, 5],
            "classifier__class_weight": [None, "balanced"],
        },
    ),
    (
        "Extra Trees",
        ExtraTreesClassifier(
            random_state=42,
            n_jobs=1,
        ),
        {
            "classifier__n_estimators": [100],
            "classifier__max_depth": [None, 10],
            "classifier__min_samples_leaf": [1, 5],
            "classifier__class_weight": [None, "balanced"],
        },
    ),
]

cv = StratifiedKFold(
    n_splits=5,
    shuffle=True,
    random_state=42,
)

comparison_rows = []
best_model = None
best_cv_accuracy = -1
best_model_name = None
best_test_metrics = None
best_confusion = None


# =========================================================
# 4. TRAINING DAN EVALUASI SEMUA MODEL
# =========================================================

for name, classifier, param_grid in model_specs:
    print(f"\nSedang menguji: {name}")

    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", classifier),
    ])

    if param_grid:
        search = GridSearchCV(
            estimator=pipeline,
            param_grid=param_grid,
            scoring="accuracy",
            cv=cv,
            n_jobs=-1,
            refit=True,
            verbose=0,
        )
        search.fit(X_train, y_train)

        fitted_model = search.best_estimator_
        cv_accuracy = search.best_score_
        best_params = str(search.best_params_)

    else:
        scores = cross_val_score(
            pipeline,
            X_train,
            y_train,
            scoring="accuracy",
            cv=cv,
            n_jobs=-1,
        )
        cv_accuracy = scores.mean()
        best_params = "Tidak ada tuning"
        fitted_model = pipeline.fit(X_train, y_train)

    # Evaluasi menggunakan data testing.
    predictions = fitted_model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)
    precision = precision_score(
        y_test, predictions, zero_division=0
    )
    recall = recall_score(
        y_test, predictions, zero_division=0
    )
    f1 = f1_score(
        y_test, predictions, zero_division=0
    )

    probabilities = fitted_model.predict_proba(X_test)
    classes = list(
        fitted_model.named_steps["classifier"].classes_
    )
    positive_index = classes.index(1)

    roc_auc = roc_auc_score(
        y_test, probabilities[:, positive_index]
    )

    metrics = {
        "model": name,
        "cv_accuracy": cv_accuracy,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "roc_auc": roc_auc,
        "best_params": best_params,
    }
    comparison_rows.append(metrics)

    # Tampilan metrik per model dibuat lebih mudah dibaca.
    print(f"CV Accuracy  : {cv_accuracy * 100:6.2f}%")
    print(f"Test Accuracy: {accuracy * 100:6.2f}%")
    print(f"Precision    : {precision * 100:6.2f}%")
    print(f"Recall       : {recall * 100:6.2f}%")
    print(f"F1-score     : {f1 * 100:6.2f}%")
    print(f"ROC AUC      : {roc_auc * 100:6.2f}%")

    # Pemilihan ini berdasarkan CV Accuracy.
    # Model terpilih bukan otomatis model deteksi fraud terbaik.
    if cv_accuracy > best_cv_accuracy:
        best_cv_accuracy = cv_accuracy
        best_model = fitted_model
        best_model_name = name
        best_test_metrics = metrics
        best_confusion = confusion_matrix(
            y_test, predictions, labels=[0, 1]
        )


# =========================================================
# 5. SIMPAN HASIL PERBANDINGAN
# =========================================================

comparison = pd.DataFrame(comparison_rows)

# Tambahkan hasil eksperimen Random Forest sebelumnya jika ada.
previous_file = (
    RESULTS_DIR / "model_comparison_baseline_vs_tuned.csv"
)

if previous_file.exists():
    previous = pd.read_csv(previous_file)

    for _, row in previous.iterrows():
        comparison = pd.concat(
            [
                comparison,
                pd.DataFrame([{
                    "model": row["model"],
                    "cv_accuracy": float("nan"),
                    "accuracy": row["accuracy"],
                    "precision": row["precision"],
                    "recall": row["recall"],
                    "f1_score": row["f1_score"],
                    "roc_auc": row["roc_auc"],
                    "best_params": "Hasil eksperimen sebelumnya",
                }]),
            ],
            ignore_index=True,
        )

comparison = comparison.sort_values(
    "cv_accuracy",
    ascending=False,
    na_position="last",
)

# CSV menyimpan angka numerik asli, bukan teks persentase.
comparison.to_csv(
    RESULTS_DIR / "accuracy_model_comparison.csv",
    index=False,
)

# Nama file menjelaskan bahwa pemilihan berdasarkan CV Accuracy.
# File ini untuk dokumentasi perbandingan, bukan otomatis untuk operasional.
joblib.dump(
    best_model,
    RESULTS_DIR / "highest_cv_accuracy_comparison_model.joblib",
)

pd.DataFrame([best_test_metrics]).to_csv(
    RESULTS_DIR / "highest_cv_accuracy_model_metrics.csv",
    index=False,
)

pd.DataFrame(
    best_confusion,
    index=["Aktual valid", "Aktual fraud"],
    columns=["Prediksi valid", "Prediksi fraud"],
).to_csv(
    RESULTS_DIR / "highest_cv_accuracy_confusion_matrix.csv"
)


# =========================================================
# 6. TAMPILKAN TABEL PERBANDINGAN YANG RAPI
# =========================================================

display_table = comparison[
    [
        "model",
        "cv_accuracy",
        "accuracy",
        "precision",
        "recall",
        "f1_score",
        "roc_auc",
    ]
].copy()


def format_percentage(value):
    """Tampilkan angka desimal sebagai persentase."""
    if pd.isna(value):
        return "-"
    return f"{value * 100:.2f}%"


percentage_columns = [
    "cv_accuracy",
    "accuracy",
    "precision",
    "recall",
    "f1_score",
    "roc_auc",
]

for column in percentage_columns:
    display_table[column] = display_table[column].apply(
        format_percentage
    )

print("\n" + "=" * 100)
print("HASIL PERBANDINGAN MODEL")
print("=" * 100)
print(display_table.to_string(index=False))

print("\n" + "=" * 100)
print("RINGKASAN MODEL BERDASARKAN CV ACCURACY")
print("=" * 100)
print(f"Model terpilih : {best_model_name}")
print(f"CV Accuracy    : {best_cv_accuracy * 100:.2f}%")
print(
    "Test Accuracy  : "
    f"{best_test_metrics['accuracy'] * 100:.2f}%"
)

if best_test_metrics["recall"] == 0:
    print(
        "PERINGATAN: Model terpilih tidak mendeteksi "
        "klik fraud pada data testing."
    )

print(
    "\nCatatan: model terpilih berdasarkan CV Accuracy "
    "tidak otomatis menjadi model deteksi fraud terbaik."
)
print(f"Hasil tersimpan di: {RESULTS_DIR}")
