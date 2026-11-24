import sys
import unittest
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from train_web_robot_model import load_dataset, EXCLUDED_FEATURES


class WebRobotDatasetTests(unittest.TestCase):
    def test_pairing_and_label_distribution_are_validated(self):
        X, y = load_dataset()
        self.assertEqual(len(X), 67352)
        self.assertEqual(int((y == 0).sum()), 53858)
        self.assertEqual(int((y == 1).sum()), 13494)
        self.assertEqual(len(X.columns), 33)
        self.assertNotIn("ID", X.columns)
        self.assertNotIn("ROBOT", X.columns)
        self.assertNotIn("PENALTY", X.columns)
        self.assertNotIn("MAX_BARRAGE", X.columns)
        self.assertFalse(X.select_dtypes(exclude=["number"]).shape[1])


if __name__ == "__main__":
    unittest.main()
