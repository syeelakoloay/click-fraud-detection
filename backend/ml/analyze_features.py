from pathlib import Path

import pandas as pd


# ==========================================
# 1. PENGATURAN FILE
# ==========================================

ML_DIR = Path(__file__).resolve().parent
RESULTS_DIR = ML_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

DATA_FILE = ML_DIR / "click_fraud_features.csv"
NUMERIC_OUTPUT = RESULTS_DIR / "numeric_feature_comparison.csv"
CATEGORY_OUTPUT = RESULTS_DIR / "categorical_fraud_rates.csv"

TARGET = "is_fraudulent"

# Fitur yang secara makna merupakan kategori,
# meskipun sebagian nilainya mungkin berbentuk angka.
CATEGORICAL_FEATURES = [
    "VPN_usage",
    "proxy_usage",
    "click_day_of_week",
    "device_type",
    "browser",
    "operating_system",
    "ad_position",
    "device_ip_reputation",
]


def main() -> int:
    # ==========================================
    # 2. MEMBACA DATASET
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
            "Target harus berisi label 0 dan 1."
        )

    # ==========================================
    # 3. MENENTUKAN KELOMPOK FITUR
    # ==========================================

    features = df.drop(columns=[TARGET])

    categorical_features = [
        col for col in features.columns
        if (
            col in CATEGORICAL_FEATURES
            or not pd.api.types.is_numeric_dtype(features[col])
        )
    ]

    numeric_features = [
        col for col in features.columns
        if (
            col not in categorical_features
            and pd.api.types.is_numeric_dtype(features[col])
        )
    ]

    print("\n=== INFORMASI DATASET ===")
    print(f"Jumlah data       : {len(df)}")
    print(f"Jumlah fitur      : {len(features.columns)}")
    print(f"Jumlah non-fraud  : {(y == 0).sum()}")
    print(f"Jumlah fraud      : {(y == 1).sum()}")
    print(f"Fitur numerik     : {len(numeric_features)}")
    print(f"Fitur kategorikal : {len(categorical_features)}")

    # ==========================================
    # 4. MEMBANDINGKAN FITUR NUMERIK
    # ==========================================

    numeric_rows = []

    for col in numeric_features:
        non_fraud = pd.to_numeric(
            df.loc[y == 0, col], errors="coerce"
        ).dropna()

        fraud = pd.to_numeric(
            df.loc[y == 1, col], errors="coerce"
        ).dropna()

        numeric_rows.append({
            "feature": col,
            "non_fraud_count": len(non_fraud),
            "fraud_count": len(fraud),
            "non_fraud_mean": non_fraud.mean(),
            "fraud_mean": fraud.mean(),
            "mean_difference_fraud_minus_non_fraud": (
                fraud.mean() - non_fraud.mean()
            ),
            "non_fraud_median": non_fraud.median(),
            "fraud_median": fraud.median(),
            "non_fraud_std": non_fraud.std(),
            "fraud_std": fraud.std(),
        })

    numeric_df = pd.DataFrame(numeric_rows)

    if not numeric_df.empty:
        numeric_df = numeric_df.round(4)
        numeric_df.to_csv(NUMERIC_OUTPUT, index=False)

        print("\n=== PERBANDINGAN FITUR NUMERIK ===")
        print(numeric_df.to_string(index=False))
    else:
        print("\nTidak ditemukan fitur numerik untuk dibandingkan.")

    # ==========================================
    # 5. MEMBANDINGKAN FITUR KATEGORIKAL
    # ==========================================

    category_rows = []

    for col in categorical_features:
        temp = pd.DataFrame({
            "category_value": df[col].astype("string").fillna("Missing"),
            TARGET: y,
        })

        counts = (
            temp.groupby(["category_value", TARGET], observed=True)
            .size()
            .unstack(fill_value=0)
            .reindex(columns=[0, 1], fill_value=0)
        )

        counts = counts.rename(columns={
            0: "non_fraud_count",
            1: "fraud_count",
        })

        counts["total_count"] = (
            counts["non_fraud_count"] + counts["fraud_count"]
        )

        counts["fraud_rate_percent"] = (
            counts["fraud_count"] / counts["total_count"] * 100
        ).round(2)

        counts["feature"] = col
        counts = counts.reset_index()
        category_rows.append(counts)

    if category_rows:
        category_df = pd.concat(category_rows, ignore_index=True)
        category_df = category_df[[
            "feature",
            "category_value",
            "non_fraud_count",
            "fraud_count",
            "total_count",
            "fraud_rate_percent",
        ]]

        category_df = category_df.sort_values(
            ["feature", "total_count"],
            ascending=[True, False],
        )

        category_df.to_csv(CATEGORY_OUTPUT, index=False)

        print("\n=== RINGKASAN FITUR KATEGORIKAL ===")
        print(category_df.head(25).to_string(index=False))
        print(
            "\nCatatan: fraud rate adalah persentase label "
            "fraud dalam setiap kategori."
        )
    else:
        print("\nTidak ditemukan fitur kategorikal untuk dibandingkan.")

    # ==========================================
    # 6. FILE OUTPUT
    # ==========================================

    print("\n=== FILE OUTPUT ===")

    if not numeric_df.empty:
        print(f"Perbandingan numerik : {NUMERIC_OUTPUT}")

    if category_rows:
        print(f"Fraud rate kategori  : {CATEGORY_OUTPUT}")

    print("\nAnalisis fitur berdasarkan label selesai.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
