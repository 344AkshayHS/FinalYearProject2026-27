# Tests for the FAO EcoCrop checks (app/suitability.py). Built-in unittest, no extra library.
# Run from the ml-service folder:  .venv\Scripts\python -m unittest discover tests

import unittest

from app.suitability import all_needs, check, rate, rate_texture, seasonal, texture_class


class RateTest(unittest.TestCase):
    def test_inside_the_optimal_range_is_good(self):
        self.assertEqual(rate(6.5, 5.5, 7.0, 4.5, 9.0), "good")

    def test_inside_only_the_absolute_range_is_possible(self):
        self.assertEqual(rate(8.0, 5.5, 7.0, 4.5, 9.0), "possible")

    def test_outside_both_is_unsuited(self):
        self.assertEqual(rate(3.0, 5.5, 7.0, 4.5, 9.0), "unsuited")

    def test_the_edges_count_as_inside(self):
        self.assertEqual(rate(5.5, 5.5, 7.0, 4.5, 9.0), "good")
        self.assertEqual(rate(9.0, 5.5, 7.0, 4.5, 9.0), "possible")

    def test_a_missing_range_gives_no_rating(self):
        self.assertIsNone(rate(6.5, 5.5, 7.0, float("nan"), float("nan")))


class TextureTest(unittest.TestCase):
    def test_soil_texture_classes(self):
        self.assertEqual(texture_class(clay=40, sand=20), "heavy")
        self.assertEqual(texture_class(clay=10, sand=70), "light")
        self.assertEqual(texture_class(clay=25, sand=40), "medium")

    def test_wide_suits_every_soil(self):
        self.assertEqual(rate_texture("heavy", "wide", "wide"), "good")
        self.assertEqual(rate_texture("light", "medium, organic", "heavy, medium"), "unsuited")
        self.assertEqual(rate_texture("heavy", "medium, organic", "heavy, medium"), "possible")


class SeasonalTest(unittest.TestCase):
    def test_field_crops_are_seasonal_trees_are_not(self):
        self.assertTrue(seasonal("rice"))
        self.assertTrue(seasonal("ragi"))
        self.assertFalse(seasonal("coconut"))
        self.assertFalse(seasonal("arecanut"))

    def test_herbs_by_their_life_span(self):
        self.assertTrue(seasonal("tulsi"))  # annual herb
        self.assertFalse(seasonal("ashwagandha"))  # perennial herb
        self.assertTrue(seasonal("brinjal"))  # vegetable


class NeedsTest(unittest.TestCase):
    def test_every_crop_has_its_needs_and_low_is_not_above_high(self):
        needs = all_needs()
        self.assertEqual(len(needs), 93)
        for crop, item in needs.items():
            self.assertIn(item["fertility"], ("low", "moderate", "high", None), crop)
            for key in ("ph", "rain_mm", "temperature_c"):
                low, high = item["needs"][key]
                if low is not None and high is not None:
                    self.assertLessEqual(low, high, f"{crop} {key}")

    def test_check_rates_a_real_land(self):
        land = {"pH": 6.2, "Temperature": 27.0, "Winter_Temperature": 24.0, "Rainfall": 3500.0,
                "Season_Rain": 2900.0, "Clay": 30.0, "Sand": 40.0}
        rice = check("rice", land, "Kharif")
        self.assertEqual(rice["ph"], "good")
        self.assertEqual(rice["temperature"], "good")
        self.assertEqual(rice["rain_mm"], 2900)  # checked against the season's rain
        self.assertTrue(rice["rain_is_season"])
        self.assertEqual(check("coconut", land, "Kharif")["rain_mm"], 3500)  # a tree against the year's
        self.assertIsNone(check("not a crop", land, "Kharif"))


if __name__ == "__main__":
    unittest.main()
