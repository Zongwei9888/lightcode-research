import unittest

from inventory import parse_config


class ParseConfigTests(unittest.TestCase):
    def test_defaults(self):
        cfg = parse_config({})
        self.assertEqual(cfg["currency"], "EUR")
        self.assertEqual(cfg["retry_backoff"], 1.5)

    def test_override(self):
        self.assertEqual(parse_config({"currency": "USD"})["currency"], "USD")

    def test_backoff_must_be_positive(self):
        with self.assertRaises(ValueError):
            parse_config({"retry_backoff": 0})

    def test_retries_must_not_be_negative(self):
        with self.assertRaises(ValueError):
            parse_config({"max_retries": -1})


if __name__ == "__main__":
    unittest.main()
