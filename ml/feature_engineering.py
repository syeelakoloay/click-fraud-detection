from pathlib import Path
import sys
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = PROJECT_ROOT / "dataset" / "click_fraud_dataset.csv"
OUTPUT_FILE = Path(__file__).resolve().parent / "click_fraud_features.csv"

REQUIRED_COLUMNS = [
    "click_id", "timestamp", "user_id", "ip_address", "device_type",
    "browser", "operating_system", "referrer_url", "page_url",
    "click_duration", "scroll_depth", "mouse_movement",
    "keystrokes_detected", "ad_position", "click_frequency",
    "time_since_last_click", "device_ip_reputation", "VPN_usage",
    "proxy_usage", "bot_likelihood_score", "is_fraudulent",
]

NUMERIC_FEATURES = [
    "click_hour", "click_duration", "scroll_depth", "mouse_movement",
    "keystrokes_detected", "click_frequency", "time_since_last_click",
    "VPN_usage", "proxy_usage",
]

CATEGORICAL_FEATURES = [
    "click_day_of_week", "device_type", "browser", "operating_system",
    "ad_position", "device_ip_reputation",
]

TARGET = "is_fraudulent"


def main() -> int:
    if not INPUT_FILE.exists():
        print("ERROR: Dataset tidak ditemukan.")
        print(f"Lokasi yang diperiksa: {INPUT_FILE}")
        print("Pastikan click_fraud_dataset.csv berada di folder dataset/ pada root proyek.")
        return 1

    print(f"Membaca dataset: {INPUT_FILE}")
    try:
        df = pd.read_csv(INPUT_FILE)
    except Exception as exc:
        print(f"ERROR: Dataset gagal dibaca: {exc}")
        return 1

    missing_columns = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing_columns:
        print("ERROR: Kolom wajib berikut tidak ditemukan:")
        for col in missing_columns:
            print(f"- {col}")
        print("Periksa nama kolom pada dataset sebelum melanjutkan.")
        return 1

    original_shape = df.shape

    # Parse timestamp tanpa mengarang atau mengganti waktu yang invalid.
    timestamps = pd.to_datetime(df["timestamp"], errors="coerce")
    invalid_timestamps = int(timestamps.isna().sum())
    if invalid_timestamps:
        print(f"ERROR: Ditemukan {invalid_timestamps} timestamp kosong/invalid. Output tidak dibuat.")
        return 1

    # Feature waktu yang dibentuk dari timestamp sumber.
    df["click_hour"] = timestamps.dt.hour
    df["click_day_of_week"] = timestamps.dt.day_name()

    # Validasi kolom numerik sumber dan target.
    numeric_source_columns = [col for col in NUMERIC_FEATURES if col != "click_hour"]
    columns_to_convert = numeric_source_columns + [TARGET]
    for col in columns_to_convert:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    invalid_numeric = {
        col: int(df[col].isna().sum())
        for col in columns_to_convert
        if df[col].isna().any()
    }
    if invalid_numeric:
        print("ERROR: Ada nilai numerik/target yang kosong atau tidak valid:")
        for col, count in invalid_numeric.items():
            print(f"- {col}: {count} nilai")
        print("Output tidak dibuat agar nilai bermasalah tidak diam-diam diubah.")
        return 1

    invalid_labels = sorted(set(df[TARGET].unique().tolist()) - {0, 1})
    if invalid_labels:
        print(f"ERROR: Label {TARGET} harus hanya 0 atau 1. Ditemukan: {invalid_labels}")
        return 1
    df[TARGET] = df[TARGET].astype("int64")

    # Rapikan kategori sebagai teks; kategori kosong akan ditangani sebagai error.
    for col in CATEGORICAL_FEATURES:
        df[col] = df[col].astype("string").str.strip().replace("", pd.NA)

    feature_columns = NUMERIC_FEATURES + CATEGORICAL_FEATURES
    output_columns = feature_columns + [TARGET]
    result = df[output_columns].copy()

    missing_output = {
        col: int(result[col].isna().sum())
        for col in output_columns
        if result[col].isna().any()
    }
    if missing_output:
        print("ERROR: Output fitur memiliki nilai kosong. Output tidak dibuat:")
        for col, count in missing_output.items():
            print(f"- {col}: {count} nilai kosong")
        return 1

    # Diagnostik IP: IP mentah tetap tidak dimasukkan ke input model.
    ip_values = df["ip_address"].dropna().astype("string")
    ip_counts = ip_values.value_counts()
    unique_ip_count = int(ip_values.nunique())
    repeated_ip_count = int((ip_counts > 1).sum())

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        result.to_csv(OUTPUT_FILE, index=False)
    except Exception as exc:
        print(f"ERROR: Output gagal disimpan: {exc}")
        return 1

    print("\n=== HASIL FEATURE ENGINEERING ===")
    print(f"Ukuran dataset sumber: {original_shape[0]} baris x {original_shape[1]} kolom")
    print(f"Ukuran dataset output: {result.shape[0]} baris x {result.shape[1]} kolom")
    print(f"Jumlah fitur input: {len(feature_columns)}")
    print(f"Jumlah target: 1 ({TARGET})")
    print(f"Timestamp invalid: {invalid_timestamps}")
    print(f"Variasi jam klik: {df['click_hour'].nunique()} dari 24")
    print(f"Variasi hari: {df['click_day_of_week'].nunique()} dari 7")
    print(f"Jumlah IP unik: {unique_ip_count} dari {len(df)} event")
    print(f"Jumlah nilai IP yang muncul lebih dari sekali: {repeated_ip_count}")
    print("User-agent: tidak tersedia pada dataset; tidak dibuat atau diasumsikan.")
    print("bot_likelihood_score: tidak dimasukkan sementara karena perlu pemeriksaan data leakage.")
    print("Identifier mentah, URL mentah, dan timestamp mentah tidak dimasukkan sebagai fitur output.")
    print(f"Nilai kosong pada output: {int(result.isna().sum().sum())}")
    print(f"File output disimpan di: {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
