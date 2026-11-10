
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import json
import traceback

import joblib
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "ml" / "results" / "random_forest_model.joblib"
HOST = "127.0.0.1"
PORT = 8000

FEATURE_COLUMNS = [
    "click_hour",
    "click_duration",
    "scroll_depth",
    "mouse_movement",
    "keystrokes_detected",
    "click_frequency",
    "time_since_last_click",
    "VPN_usage",
    "proxy_usage",
    "click_day_of_week",
    "device_type",
    "browser",
    "operating_system",
    "ad_position",
    "device_ip_reputation",
]

NUMERIC_FEATURES = FEATURE_COLUMNS[:9]
CATEGORICAL_FEATURES = FEATURE_COLUMNS[9:]

model = joblib.load(MODEL_PATH)
print(f"Model dimuat: {MODEL_PATH}")
print(f"Layanan prediksi berjalan pada http://{HOST}:{PORT}")


class PredictionHandler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {
                "error": "Endpoint tidak ditemukan."
            })

        return self.send_json(200, {
            "status": "ok",
            "model_loaded": True
        })

    def do_POST(self):
        if self.path != "/predict":
            return self.send_json(404, {
                "error": "Endpoint tidak ditemukan."
            })

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                return self.send_json(400, {
                    "error": "Body JSON kosong atau terlalu besar."
                })

            payload = json.loads(self.rfile.read(length))

            if not isinstance(payload, dict):
                return self.send_json(400, {
                    "error": "Body harus berupa object JSON."
                })

            missing = [
                name for name in FEATURE_COLUMNS
                if name not in payload
            ]
            if missing:
                return self.send_json(400, {
                    "error": "Fitur wajib belum lengkap.",
                    "missing_features": missing
                })

            features = {}
            for name in NUMERIC_FEATURES:
                value = payload[name]
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    return self.send_json(400, {
                        "error": f"{name} harus berupa angka."
                    })
                features[name] = value

            for name in CATEGORICAL_FEATURES:
                value = payload[name]
                if not isinstance(value, str) or not value.strip():
                    return self.send_json(400, {
                        "error": f"{name} harus berupa teks yang tidak kosong."
                    })
                features[name] = value.strip()

            frame = pd.DataFrame(
                [{name: features[name] for name in FEATURE_COLUMNS}],
                columns=FEATURE_COLUMNS
            )

            prediction = int(model.predict(frame)[0])
            probabilities = model.predict_proba(frame)[0]
            classes = model.classes_

            probability_map = {
                str(label): round(float(probability), 6)
                for label, probability in zip(classes, probabilities)
            }

            return self.send_json(200, {
                "prediction": prediction,
                "classification": (
                    "Fraud" if prediction == 1 else "Valid"
                ),
                "probabilities": {
                    "Valid": probability_map.get("0", 0.0),
                    "Fraud": probability_map.get("1", 0.0)
                }
            })

        except json.JSONDecodeError:
            return self.send_json(400, {
                "error": "Body bukan JSON yang valid."
            })
        except Exception:
            traceback.print_exc()
            return self.send_json(500, {
                "error": "Prediksi gagal diproses."
            })

    def log_message(self, format_string, *args):
        print("[ML API]", format_string % args)


if __name__ == "__main__":
    HTTPServer((HOST, PORT), PredictionHandler).serve_forever()
