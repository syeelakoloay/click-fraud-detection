"""Smoke-test the Web Robot endpoint using one held-out-source row schema."""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pandas as pd

ML_DIR = Path(__file__).resolve().parent
DATA_DIR = ML_DIR / "datasets" / "web_robot_detection"
BASE_URL = os.environ.get("ML_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def request_json(url: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload, allow_nan=False).encode("utf-8")
    request = Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="GET" if payload is None else "POST",
    )
    try:
        with urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} dari {url}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(
            f"Tidak dapat menghubungi {BASE_URL}. Pastikan prediction_api.py berjalan."
        ) from exc


def main() -> int:
    simple = pd.read_csv(DATA_DIR / "simple_features.csv", nrows=1)
    semantic = pd.read_csv(DATA_DIR / "semantic_features.csv", nrows=1)
    combined = simple.merge(semantic.drop(columns=["ROBOT"]), on="ID", validate="one_to_one")
    features = combined.drop(columns=["ID", "ROBOT", "PENALTY", "MAX_BARRAGE"], errors="ignore")
    row = features.iloc[0]
    payload = {
        name: (None if pd.isna(value) else float(value))
        for name, value in row.items()
    }

    health = request_json(f"{BASE_URL}/health")
    robot_health = health.get("web_robot_detection", {})
    if robot_health.get("loaded") is not True:
        raise RuntimeError(f"Model Web Robot belum termuat: {robot_health}")
    if robot_health.get("fraud_click_classifier") is not False:
        raise RuntimeError("Health check tidak menandai model Web Robot sebagai terpisah dari click-fraud.")

    result = request_json(f"{BASE_URL}/predict/web-robot", payload)
    if result.get("model_scope") != "web_session_robot_detection":
        raise RuntimeError(f"Scope model pada respons tidak sesuai: {result}")
    if result.get("automation_eligible") is not False or result.get("fraud_click_classifier") is not False:
        raise RuntimeError("Prediksi model Robot tidak boleh menjadi dasar auto-block click-fraud.")

    print("Web Robot API smoke test: PASS")
    print(json.dumps({
        "health_status": health.get("status"),
        "web_robot_model_loaded": robot_health.get("loaded"),
        "web_robot_test_accuracy": (robot_health.get("test_metrics") or {}).get("accuracy"),
        "sample_prediction": result.get("classification"),
        "probabilities": result.get("probabilities"),
        "model_scope": result.get("model_scope"),
        "automation_eligible": result.get("automation_eligible"),
        "fraud_click_classifier": result.get("fraud_click_classifier"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        print(f"Web Robot API smoke test: FAIL - {exc}", file=sys.stderr)
        raise SystemExit(1)
