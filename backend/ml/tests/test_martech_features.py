import sys
import unittest
from pathlib import Path

import pandas as pd

ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

from martech_features import (  # noqa: E402
    FEATURE_COLUMNS,
    prepare_martech_frame,
    validate_martech_training_frame,
)


class MartechFeatureTests(unittest.TestCase):
    def sample(self):
        return pd.DataFrame([{
            "Unnamed: 0": 1,
            "android_id": "slot-a",
            "apptype": 1,
            "carrier": 0,
            "dev_height": 1920,
            "dev_ppi": 320,
            "dev_width": 1080,
            "label": 1,
            "lan": None,
            "media_id": 10,
            "ntt": 6,
            "os": 1,
            "osv": None,
            "package": 100,
            "sid": 9001,
            "timestamp": 1559433600000,
            "version": "1.0",
            "fea_hash": "hash-a",
            "location": 10,
            "fea1_hash": "hash-b",
            "cus_type": 1,
        }])

    def test_preprocessing_builds_expected_features_and_does_not_include_label_or_ids(self):
        raw = self.sample()
        X = prepare_martech_frame(raw, timestamp_origin_ms=1559433600000, require_label=True)
        self.assertEqual(list(X.columns), FEATURE_COLUMNS)
        self.assertNotIn("label", X.columns)
        self.assertNotIn("sid", X.columns)
        self.assertNotIn("Unnamed: 0", X.columns)
        self.assertEqual(str(X.iloc[0]["lan"]), "__MISSING__")
        self.assertEqual(int(X.iloc[0]["hour_utc"]), 0)

    def test_training_labels_must_be_binary_and_complete(self):
        second = self.sample()
        second.loc[0, "label"] = 0
        second.loc[0, "sid"] = 9002
        second.loc[0, "Unnamed: 0"] = 2
        raw = pd.concat([self.sample(), second], ignore_index=True)
        labels = validate_martech_training_frame(raw)
        self.assertEqual(int(labels.iloc[0]), 1)
        invalid = raw.copy()
        invalid.loc[0, "label"] = 2
        with self.assertRaises(ValueError):
            validate_martech_training_frame(invalid)

    def test_duplicate_session_ids_are_rejected(self):
        duplicate = self.sample()
        duplicate.loc[0, "label"] = 0
        duplicate.loc[0, "Unnamed: 0"] = 2
        raw = pd.concat([self.sample(), duplicate], ignore_index=True)
        with self.assertRaisesRegex(ValueError, "sid duplikat"):
            validate_martech_training_frame(raw)

    def test_timestamp_must_be_valid_epoch_milliseconds(self):
        raw = self.sample()
        raw["timestamp"] = raw["timestamp"].astype("string")
        raw.loc[0, "timestamp"] = "not-a-timestamp"
        with self.assertRaisesRegex(ValueError, "timestamp"):
            prepare_martech_frame(raw, timestamp_origin_ms=1559433600000)


if __name__ == "__main__":
    unittest.main()
