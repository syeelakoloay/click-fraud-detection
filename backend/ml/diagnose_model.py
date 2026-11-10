from pathlib import Path

import joblib
import pandas as pd


# ==========================================
# 1. LOKASI FILE
# ==========================================

ML_DIR = Path(__file__).resolve().parent
RESULTS_DIR = ML_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_FILE = RESULTS_DIR / "random_forest_model.joblib"
OUTPUT_FILE = RESULTS_DIR / "feature_importance.csv"


def main():
    # ==========================================
    # 2. MEMERIKSA FILE MODEL
    # ==========================================

    if not MODEL_FILE.exists():
        raise FileNotFoundError(
            f"Model tidak ditemukan: {MODEL_FILE}\n"
            "Jalankan 'python ml/train_model.py' terlebih dahulu "
            "agar model terbaru tersimpan di folder results."
        )

    # ==========================================
    # 3. MEMBACA MODEL YANG SUDAH DILATIH
    # ==========================================

    model = joblib.load(MODEL_FILE)

    if "preprocessor" not in model.named_steps or "classifier" not in model.named_steps:
        raise ValueError(
            "Format model tidak sesuai. Pastikan model dilatih oleh train_model.py terbaru."
        )

    preprocessor = model.named_steps["preprocessor"]
    classifier = model.named_steps["classifier"]

    # Mendapatkan nama fitur setelah preprocessing/encoding
    feature_names = preprocessor.get_feature_names_out()
    importances = classifier.feature_importances_

    if len(feature_names) != len(importances):
        raise ValueError(
            "Jumlah nama fitur tidak sesuai dengan jumlah feature importance."
        )

    # ==========================================
    # 4. MENYUSUN HASIL ANALISIS
    # ==========================================

    results = pd.DataFrame({
        "feature": feature_names,
        "importance": importances,
    })

    results = results.sort_values(
        by="importance",
        ascending=False,
    ).reset_index(drop=True)

    results["importance_percent"] = results["importance"] * 100

    # ==========================================
    # 5. MENAMPILKAN 15 FITUR TERATAS
    # ==========================================

    print("\n=== FEATURE IMPORTANCE RANDOM FOREST ===")
    print(
        results[["feature", "importance_percent"]]
        .head(15)
        .to_string(
            index=False,
            formatters={"importance_percent": "{:.4f}".format},
        )
    )

    # ==========================================
    # 6. MENYIMPAN HASIL
    # ==========================================

    results.to_csv(OUTPUT_FILE, index=False)

    print("\n=== FILE OUTPUT ===")
    print(f"Model dibaca dari: {MODEL_FILE}")
    print(f"Hasil disimpan di: {OUTPUT_FILE}")
    print("\nAnalisis feature importance selesai.")


if __name__ == "__main__":
    main()
