import json
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(PLUGIN, "scripts"))

import check_i18n  # noqa: E402

I18N = os.path.join(PLUGIN, "i18n")
SYSTEM_LOCALES = "/usr/share/omarchy/default/i18n/locales.json"


def write_json(path, data):
    with open(path, "w") as handle:
        json.dump(data, handle)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = os.path.join(self.tmp.name, "i18n")
        os.mkdir(self.dir)
        self.locales = os.path.join(self.tmp.name, "locales.json")
        write_json(self.locales, {"en": {}, "pt-BR": {}, "da": {}})
        write_json(os.path.join(self.dir, "en.json"), {"a": "Hello", "b": "%1 of %2"})


class Checker(Fixture):
    def test_matching_catalog_has_no_problems(self):
        write_json(os.path.join(self.dir, "da.json"), {"a": "Hej", "b": "%1 af %2"})
        self.assertEqual(check_i18n.check(self.dir, self.locales), [])

    def test_partial_catalog_is_fine(self):
        write_json(os.path.join(self.dir, "da.json"), {"a": "Hej"})
        self.assertEqual(check_i18n.check(self.dir, self.locales), [])

    def test_unknown_language_code_is_reported(self):
        write_json(os.path.join(self.dir, "xx-bad.json"), {"a": "x"})
        problems = check_i18n.check(self.dir, self.locales)
        self.assertEqual(len(problems), 1)
        self.assertIn("xx-bad.json", problems[0])

    def test_extra_key_is_reported(self):
        write_json(os.path.join(self.dir, "da.json"), {"a": "Hej", "c": "Ekstra"})
        problems = check_i18n.check(self.dir, self.locales)
        self.assertEqual(len(problems), 1)
        self.assertIn("da.json", problems[0])
        self.assertIn("c", problems[0])

    def test_missing_placeholder_is_reported(self):
        write_json(os.path.join(self.dir, "da.json"), {"b": "af"})
        problems = check_i18n.check(self.dir, self.locales)
        self.assertEqual(len(problems), 1)
        self.assertIn("b", problems[0])

    def test_extra_placeholder_is_reported(self):
        write_json(os.path.join(self.dir, "da.json"), {"a": "Hej %1"})
        self.assertEqual(len(check_i18n.check(self.dir, self.locales)), 1)

    def test_invalid_json_is_reported(self):
        with open(os.path.join(self.dir, "da.json"), "w") as handle:
            handle.write("{not json")
        problems = check_i18n.check(self.dir, self.locales)
        self.assertEqual(len(problems), 1)
        self.assertIn("da.json", problems[0])

    def test_non_string_value_is_reported(self):
        write_json(os.path.join(self.dir, "da.json"), {"a": 5})
        self.assertEqual(len(check_i18n.check(self.dir, self.locales)), 1)

    def test_missing_english_catalog_is_reported(self):
        os.remove(os.path.join(self.dir, "en.json"))
        self.assertEqual(len(check_i18n.check(self.dir, self.locales)), 1)


class ShippedCatalogs(unittest.TestCase):
    @unittest.skipUnless(os.path.exists(SYSTEM_LOCALES), "Omarchy locales registry not installed")
    def test_shipped_catalogs_pass_against_the_omarchy_registry(self):
        self.assertEqual(check_i18n.check(I18N, SYSTEM_LOCALES), [])

    def test_every_key_the_qml_uses_exists_in_english(self):
        with open(os.path.join(I18N, "en.json")) as handle:
            english = json.load(handle)
        used = set()
        for name in ("ColorSection.qml", "ColorStrings.qml"):
            with open(os.path.join(PLUGIN, name)) as handle:
                # Any quoted catalog key, including ones chosen in an expression (a ? "x.y" : "x.z").
                used |= set(re.findall(r'"((?:section|group|value|action|warn|item|preset)\.[A-Za-z0-9.-]+)"', handle.read()))
        with open(os.path.join(PLUGIN, "presets.json")) as handle:
            used |= {p["labelKey"] for p in json.load(handle)["presets"]}
        used.add("item.edid")
        self.assertEqual(sorted(used - set(english)), [])

    def test_portuguese_covers_every_english_key(self):
        with open(os.path.join(I18N, "en.json")) as handle:
            english = json.load(handle)
        with open(os.path.join(I18N, "pt-BR.json")) as handle:
            portuguese = json.load(handle)
        self.assertEqual(sorted(set(english) - set(portuguese)), [])


if __name__ == "__main__":
    unittest.main()
