from pathlib import Path
import json
import sys

import pandas as pd
from sklearn.metrics import roc_auc_score


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = PROJECT_ROOT / "dataset" / "click_fraud_dataset.csv"
OUTPUT_FILE = Path(__file__).resolve().parent / "results" / "dataset_audit.json"
TARGET = "is_fraudulent"
SCORE = "bot_likelihood_score"


def main() -> int:
    if not DATA_FILE.exists():
        print(f"ERROR: Dataset tidak ditemukan: {DATA_FILE}")
        return 1

    df = pd.read_csv(DATA_FILE)
    required = {TARGET, SCORE, "timestamp", "ad_position"}
    missing = sorted(required - set(df.columns))
    if missing:
        print(f"ERROR: Kolom wajib tidak ditemukan: {', '.join(missing)}")
        return 1
    if df.empty:
        print("ERROR: Dataset kosong.")
        return 1

    labels = pd.to_numeric(df[TARGET], errors="coerce")
    scores = pd.to_numeric(df[SCORE], errors="coerce")
    if labels.isna().any() or set(labels.unique()) != {0, 1}:
        print("ERROR: is_fraudulent harus berisi label biner 0 dan 1.")
        return 1
    if scores.isna().any() or not scores.between(0, 1).all():
        print("ERROR: bot_likelihood_score harus numerik dan berada pada rentang 0–1.")
        return 1

    valid_scores = scores[labels == 0]
    fraud_scores = scores[labels == 1]
    valid_max = float(valid_scores.max())
    fraud_min = float(fraud_scores.min())
    separated = valid_max < fraud_min
    auc = float(roc_auc_score(labels, scores))
    numeric_predictors = df.select_dtypes(include=["number"]).drop(columns=[TARGET, SCORE], errors="ignore")
    numeric_correlations = numeric_predictors.corrwith(labels).dropna()
    max_abs_numeric_correlation = float(numeric_correlations.abs().max()) if len(numeric_correlations) else None
    strongest_numeric_feature = str(numeric_correlations.abs().idxmax()) if len(numeric_correlations) else None

    advertiser_columns = [
        name for name in df.columns
        if any(token in name.lower() for token in ("brand", "product", "advertiser", "campaign", "creative", "ad_id"))
    ]
    profile = {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "label_counts": {str(int(k)): int(v) for k, v in labels.value_counts().sort_index().items()},
        "label_percent": {str(int(k)): round(float(v / len(df) * 100), 2) for k, v in labels.value_counts().sort_index().items()},
        "timestamp_min": str(pd.to_datetime(df["timestamp"], errors="coerce").min()),
        "timestamp_max": str(pd.to_datetime(df["timestamp"], errors="coerce").max()),
        "device_types": sorted(df["device_type"].dropna().astype(str).unique().tolist()) if "device_type" in df else [],
        "browsers": sorted(df["browser"].dropna().astype(str).unique().tolist()) if "browser" in df else [],
        "operating_systems": sorted(df["operating_system"].dropna().astype(str).unique().tolist()) if "operating_system" in df else [],
        "ad_positions": sorted(df["ad_position"].dropna().astype(str).unique().tolist()),
        "advertiser_or_product_columns": advertiser_columns,
        "non_score_numeric_signal": {
            "strongest_absolute_correlation_feature": strongest_numeric_feature,
            "max_absolute_pearson_correlation_with_label": max_abs_numeric_correlation,
        },
        "bot_likelihood_score": {
            "valid_min": float(valid_scores.min()),
            "valid_max": valid_max,
            "fraud_min": fraud_min,
            "fraud_max": float(fraud_scores.max()),
            "perfect_label_separation": bool(separated),
            "roc_auc_against_label": round(auc, 6),
            "training_decision": "exclude_from_primary_features_due_to_target_leakage_risk" if separated and auc == 1.0 else "verify_score_provenance_before_training_use",
        },
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("=== AUDIT DATASET CLICKGUARD ===")
    print(f"Ukuran             : {profile['rows']:,} baris x {profile['columns']} kolom")
    print(f"Label Valid        : {profile['label_counts'].get('0', 0):,} ({profile['label_percent'].get('0', 0):.2f}%)")
    print(f"Label Fraud        : {profile['label_counts'].get('1', 0):,} ({profile['label_percent'].get('1', 0):.2f}%)")
    print(f"Rentang bot score Valid : {valid_scores.min():.2f}–{valid_max:.2f}")
    print(f"Rentang bot score Fraud : {fraud_min:.2f}–{fraud_scores.max():.2f}")
    print(f"ROC-AUC bot score vs label: {auc:.4f}")
    if strongest_numeric_feature is not None:
        print(f"Korelasi numerik non-score terbesar: {strongest_numeric_feature} ({max_abs_numeric_correlation:.4f})")
    if separated and auc == 1.0:
        print("PERINGATAN: bot_likelihood_score memisahkan target secara sempurna.")
        print("Keputusan: jangan masukkan skor tersebut ke fitur model utama sebelum sumber skornya dibuktikan independen.")
    else:
        print("Keputusan: asal-usul bot_likelihood_score perlu diverifikasi sebelum dipakai sebagai fitur.")
    if not advertiser_columns:
        print("Jenis iklan: brand/produk/advertiser tidak tersedia; ad_position hanya menunjukkan posisi iklan.")
    print(f"Laporan tersimpan: {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
