from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import math
import os
import traceback

import joblib
import lightgbm as lgb
import pandas as pd

from martech_features import prepare_martech_payload

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ML_DIR = PROJECT_ROOT / "ml"
RESULTS_DIR = ML_DIR / "results"
DEFAULT_MODEL_PATH = RESULTS_DIR / "random_forest_model.joblib"
MODEL_PATH = Path(os.environ.get("CLICK_MODEL_PATH", str(DEFAULT_MODEL_PATH))).expanduser().resolve()
CLICK_METRICS_PATH = Path(os.environ.get("CLICK_MODEL_METRICS_PATH", str(RESULTS_DIR / "model_metrics.csv"))).expanduser().resolve()
MARTECH_MODEL_PATH = Path(os.environ.get("MARTECH_MODEL_PATH", str(RESULTS_DIR / "martech_lightgbm_model.txt"))).expanduser().resolve()
MARTECH_METADATA_PATH = Path(os.environ.get("MARTECH_MODEL_METADATA_PATH", str(RESULTS_DIR / "martech_model_metadata.json"))).expanduser().resolve()
WEB_ROBOT_MODEL_PATH = Path(os.environ.get("WEB_ROBOT_MODEL_PATH", str(RESULTS_DIR / "web_robot_lightgbm_model.joblib"))).expanduser().resolve()
WEB_ROBOT_METADATA_PATH = Path(os.environ.get("WEB_ROBOT_METADATA_PATH", str(RESULTS_DIR / "web_robot_model_metadata.json"))).expanduser().resolve()
HOST = os.environ.get("ML_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("ML_API_PORT", "8000"))

FEATURE_COLUMNS = [
    "click_hour", "click_duration", "scroll_depth", "mouse_movement",
    "keystrokes_detected", "click_frequency", "time_since_last_click",
    "VPN_usage", "proxy_usage", "click_day_of_week", "device_type",
    "browser", "operating_system", "ad_position", "device_ip_reputation",
]
NUMERIC_FEATURES = FEATURE_COLUMNS[:9]
CATEGORICAL_FEATURES = FEATURE_COLUMNS[9:]
QUALITY_THRESHOLDS = {
    "accuracy_strictly_greater_than": 0.95,
    "precision_fraud_minimum": 0.90,
    "recall_fraud_minimum": 0.90,
    "f1_fraud_minimum": 0.90,
    "roc_auc_minimum": 0.90,
}


def _load_click_metrics() -> dict:
    """Load the committed evaluation result. Missing/invalid metrics fail closed."""
    try:
        if CLICK_METRICS_PATH.suffix.lower() == ".json":
            payload = json.loads(CLICK_METRICS_PATH.read_text(encoding="utf-8"))
            payload = payload.get("test_metrics", payload)
            return payload if isinstance(payload, dict) else {}
        frame = pd.read_csv(CLICK_METRICS_PATH)
        if frame.empty:
            return {}
        return {key: float(value) for key, value in frame.iloc[0].to_dict().items() if pd.notna(value)}
    except (OSError, ValueError, json.JSONDecodeError, pd.errors.ParserError):
        return {}


def _click_model_readiness() -> dict:
    metrics = _load_click_metrics()
    aliases = {
        "accuracy": ("accuracy",),
        "precision_fraud": ("precision_fraud", "precision"),
        "recall_fraud": ("recall_fraud", "recall"),
        "f1_fraud": ("f1_fraud", "f1_score", "f1"),
        "roc_auc": ("roc_auc", "rocAuc"),
    }
    normalized = {}
    for output_name, candidates in aliases.items():
        value = next((metrics[name] for name in candidates if name in metrics), None)
        try:
            normalized[output_name] = float(value) if value is not None else None
        except (TypeError, ValueError):
            normalized[output_name] = None

    required = {
        "accuracy": normalized["accuracy"] is not None and normalized["accuracy"] > QUALITY_THRESHOLDS["accuracy_strictly_greater_than"],
        "precision_fraud": normalized["precision_fraud"] is not None and normalized["precision_fraud"] >= QUALITY_THRESHOLDS["precision_fraud_minimum"],
        "recall_fraud": normalized["recall_fraud"] is not None and normalized["recall_fraud"] >= QUALITY_THRESHOLDS["recall_fraud_minimum"],
        "f1_fraud": normalized["f1_fraud"] is not None and normalized["f1_fraud"] >= QUALITY_THRESHOLDS["f1_fraud_minimum"],
        "roc_auc": normalized["roc_auc"] is not None and normalized["roc_auc"] >= QUALITY_THRESHOLDS["roc_auc_minimum"],
    }
    eligible = bool(normalized) and all(required.values())
    failed = [name for name, passed in required.items() if not passed]
    return {
        "status": "production_candidate" if eligible else "shadow_only",
        "automation_eligible": eligible,
        "metrics": normalized,
        "thresholds": QUALITY_THRESHOLDS,
        "checks": required,
        "failed_checks": failed,
        "reason": None if eligible else "Model utama belum memenuhi seluruh quality gate; prediksi hanya untuk monitoring dan tidak memicu auto-block berbasis ML.",
    }


if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model CPA utama tidak ditemukan: {MODEL_PATH}")
model = joblib.load(MODEL_PATH)
print(f"Model CPA dimuat: {MODEL_PATH}")

click_readiness = _click_model_readiness()
if not click_readiness["automation_eligible"]:
    print("Quality gate CPA: shadow_only; auto-block ML dinonaktifkan.")

martech_model = None
martech_metadata = {}
martech_load_error = None
if MARTECH_MODEL_PATH.exists():
    try:
        martech_model = lgb.Booster(model_file=str(MARTECH_MODEL_PATH))
        if MARTECH_METADATA_PATH.exists():
            martech_metadata = json.loads(MARTECH_METADATA_PATH.read_text(encoding="utf-8"))
        print(f"Model benchmark MarTech dimuat: {MARTECH_MODEL_PATH}")
    except Exception as exc:  # optional benchmark must not prevent CPA API startup
        martech_load_error = str(exc)
        martech_model = None
        print(f"Model MarTech tidak dapat dimuat: {martech_load_error}")

web_robot_model = None
web_robot_metadata = {}
web_robot_load_error = None
if WEB_ROBOT_MODEL_PATH.exists():
    try:
        web_robot_model = joblib.load(WEB_ROBOT_MODEL_PATH)
        if WEB_ROBOT_METADATA_PATH.exists():
            web_robot_metadata = json.loads(WEB_ROBOT_METADATA_PATH.read_text(encoding="utf-8"))
        required_robot_features = web_robot_metadata.get("feature_columns")
        if not isinstance(required_robot_features, list) or not required_robot_features:
            raise ValueError("Metadata model Web Robot tidak memiliki feature_columns.")
        print(f"Model Web Robot dimuat: {WEB_ROBOT_MODEL_PATH}")
    except Exception as exc:  # optional session model must not prevent CPA API startup
        web_robot_load_error = str(exc)
        web_robot_model = None
        web_robot_metadata = {}
        print(f"Model Web Robot tidak dapat dimuat: {web_robot_load_error}")


class PredictionHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_payload(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 1_000_000:
            raise ValueError("Body JSON kosong atau terlalu besar.")
        payload = json.loads(self.rfile.read(length))
        if not isinstance(payload, dict):
            raise TypeError("Body harus berupa object JSON.")
        return payload

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {"error": "Endpoint tidak ditemukan."})
        return self.send_json(200, {
            "status": "ok",
            "model_loaded": True,
            "primary_model": {"scope": "CPA_click_event", **click_readiness},
            "martech_benchmark": {
                "loaded": martech_model is not None,
                "scope": "simulated_advertising_click_benchmark",
                "automation_eligible": False,
                "status": "benchmark_only" if martech_model is not None else "unavailable",
                "test_metrics": _load_martech_metrics(),
                "load_error": martech_load_error,
            },
            "web_robot_detection": {
                "loaded": web_robot_model is not None,
                "scope": "web_session_robot_detection",
                "status": "available" if web_robot_model is not None else "unavailable",
                "test_metrics": _load_web_robot_metrics(),
                "automation_eligible": False,
                "fraud_click_classifier": False,
                "load_error": web_robot_load_error,
            },
        })

    def do_POST(self):
        try:
            payload = self._read_payload()
            if self.path == "/predict":
                return self._predict_click(payload)
            if self.path == "/predict/martech":
                return self._predict_martech(payload)
            if self.path == "/predict/web-robot":
                return self._predict_web_robot(payload)
            return self.send_json(404, {"error": "Endpoint tidak ditemukan."})
        except json.JSONDecodeError:
            return self.send_json(400, {"error": "Body bukan JSON yang valid."})
        except (TypeError, ValueError) as exc:
            return self.send_json(400, {"error": str(exc)})
        except Exception:
            traceback.print_exc()
            return self.send_json(500, {"error": "Prediksi gagal diproses."})

    def _predict_click(self, payload):
        missing = [name for name in FEATURE_COLUMNS if name not in payload]
        if missing:
            return self.send_json(400, {"error": "Fitur wajib belum lengkap.", "missing_features": missing})

        features = {}
        for name in NUMERIC_FEATURES:
            value = payload[name]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return self.send_json(400, {"error": f"{name} harus berupa angka."})
            features[name] = value
        for name in CATEGORICAL_FEATURES:
            value = payload[name]
            if not isinstance(value, str) or not value.strip():
                return self.send_json(400, {"error": f"{name} harus berupa teks yang tidak kosong."})
            features[name] = value.strip()

        frame = pd.DataFrame([{name: features[name] for name in FEATURE_COLUMNS}], columns=FEATURE_COLUMNS)
        prediction = int(model.predict(frame)[0])
        probabilities = model.predict_proba(frame)[0]
        probability_map = {str(label): round(float(probability), 6) for label, probability in zip(model.classes_, probabilities)}
        return self.send_json(200, {
            "prediction": prediction,
            "classification": "Fraud" if prediction == 1 else "Valid",
            "probabilities": {"Valid": probability_map.get("0", 0.0), "Fraud": probability_map.get("1", 0.0)},
            "model_scope": "CPA_click_event",
            "model_readiness": click_readiness,
            "automation_eligible": click_readiness["automation_eligible"],
        })

    def _predict_martech(self, payload):
        if martech_model is None:
            return self.send_json(503, {"error": "Model benchmark MarTech belum tersedia. Jalankan python ml/train_martech_model.py."})
        timestamp_origin_ms = float(martech_metadata.get("timestamp_origin_ms", 0))
        frame = prepare_martech_payload(payload, timestamp_origin_ms=timestamp_origin_ms)
        probability = float(martech_model.predict(frame)[0])
        threshold = float(martech_metadata.get("threshold", 0.5))
        prediction = int(probability >= threshold)
        return self.send_json(200, {
            "prediction": prediction,
            "classification": "Fraud" if prediction == 1 else "Normal",
            "probabilities": {"Normal": round(1.0 - probability, 6), "Fraud": round(probability, 6)},
            "threshold": threshold,
            "model_scope": "martech_simulated_click_fraud_benchmark",
            "automation_eligible": False,
            "note": "Benchmark MarTech terpisah; skema dan sumber data simulasi tidak kompatibel dengan prediksi event CPA live, sehingga tidak boleh memicu pemblokiran atau tindakan Google Ads.",
        })

    def _predict_web_robot(self, payload):
        if web_robot_model is None:
            return self.send_json(503, {
                "error": "Model Web Robot belum tersedia. Jalankan python ml/train_web_robot_model.py."
            })
        feature_columns = web_robot_metadata["feature_columns"]
        missing = [name for name in feature_columns if name not in payload]
        if missing:
            return self.send_json(400, {
                "error": "Fitur sesi web belum lengkap.",
                "missing_features": missing,
            })

        features = {}
        for name in feature_columns:
            value = payload[name]
            if value is None:
                features[name] = float("nan")
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
                return self.send_json(400, {"error": f"{name} harus berupa angka atau null."})
            features[name] = float(value)

        frame = pd.DataFrame([features], columns=feature_columns)
        prediction = int(web_robot_model.predict(frame)[0])
        probabilities = web_robot_model.predict_proba(frame)[0]
        probability_map = {
            str(label): round(float(probability), 6)
            for label, probability in zip(web_robot_model.classes_, probabilities)
        }
        return self.send_json(200, {
            "prediction": prediction,
            "classification": "Robot" if prediction == 1 else "Human",
            "probabilities": {
                "Human": probability_map.get("0", 0.0),
                "Robot": probability_map.get("1", 0.0),
            },
            "model_scope": "web_session_robot_detection",
            "automation_eligible": False,
            "fraud_click_classifier": False,
            "note": "Hasil mengklasifikasikan sesi web sebagai Human/Robot, bukan Valid/Fraud klik iklan. Hasil ini tidak memicu blocklist atau tindakan Google Ads.",
        })

    def log_message(self, format_string, *args):
        print("[ML API]", format_string % args)


def _load_web_robot_metrics():
    try:
        raw = json.loads((RESULTS_DIR / "web_robot_model_metrics.json").read_text(encoding="utf-8"))
        return raw.get("test_metrics")
    except (OSError, json.JSONDecodeError):
        return None


def _load_martech_metrics():
    metrics_path = RESULTS_DIR / "martech_model_metrics.json"
    try:
        raw = json.loads(metrics_path.read_text(encoding="utf-8"))
        return raw.get("test_metrics")
    except (OSError, json.JSONDecodeError):
        return None


if __name__ == "__main__":
    print(f"Layanan prediksi berjalan pada http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), PredictionHandler).serve_forever()
