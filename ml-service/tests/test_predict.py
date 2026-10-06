# Tests for the model's answers (app/main.py). They need the trained model, artifacts/crop_model.joblib, which
# is not on GitHub (training/train_location_model.py makes it): without it they are skipped.
# Run from the ml-service folder:  .venv\Scripts\python -m unittest discover tests

import os
import unittest

HAS_MODEL = os.path.exists("artifacts/crop_model.joblib")


@unittest.skipUnless(HAS_MODEL, "no trained model on this PC")
class PredictTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app import main  # loads the model once, as the service does

        cls.main = main

    def test_a_district_answer_is_a_sound_ranking(self):
        result = self.main.predict_district(self.main.District(district="MYSORE", season="Kharif"))
        crops = [item["crop"] for item in result["recommendations"]]
        probabilities = [item["probability"] for item in result["recommendations"]]
        self.assertEqual(len(crops), 5)
        self.assertEqual(probabilities, sorted(probabilities, reverse=True))
        self.assertTrue(all(crop in self.main.crops for crop in crops))
        self.assertAlmostEqual(sum(item["probability"] for item in result["all_crops"]), 1, places=2)
        self.assertGreater(result["sample_points"], 1)

    def test_the_season_changes_the_answer(self):
        kharif = self.main.predict_district(self.main.District(district="MYSORE", season="Kharif"))
        rabi = self.main.predict_district(self.main.District(district="MYSORE", season="Rabi"))
        self.assertNotEqual(kharif["all_crops"][:10], rabi["all_crops"][:10])

    def test_the_farmers_own_ph_is_used(self):
        result = self.main.predict_district(self.main.District(district="MYSORE", season="Kharif", pH=8.9))
        self.assertEqual(result["typical_features"]["pH"], 8.9)

    def test_an_unknown_district_is_a_404(self):
        with self.assertRaises(self.main.HTTPException) as error:
            self.main.predict_district(self.main.District(district="NOWHERE"))
        self.assertEqual(error.exception.status_code, 404)

    def test_crop_needs_for_the_app(self):
        self.assertEqual(len(self.main.crop_needs()), 93)


if __name__ == "__main__":
    unittest.main()
