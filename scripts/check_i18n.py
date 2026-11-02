#!/usr/bin/env python3
"""Checks the plugin's translation catalogs against en.json and the Omarchy locale registry.

Usage: check_i18n.py [I18N_DIR] [LOCALES_JSON]
Exit code 1 when anything is wrong, so contributors and CI can run it on a translation PR.
"""
import json
import os
import re
import sys

DEFAULT_LOCALES = "/usr/share/omarchy/default/i18n/locales.json"
PLACEHOLDER = re.compile(r"%\d+")


def _load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def check(directory, locales_path):
    """Returns a list of human-readable problems; empty means the catalogs are fine."""
    english_path = os.path.join(directory, "en.json")
    try:
        english = _load(english_path)
    except (OSError, ValueError) as err:
        return ["en.json: cannot read the English catalog (%s)" % err]
    try:
        known_codes = set(_load(locales_path))
    except (OSError, ValueError) as err:
        return ["%s: cannot read the locale registry (%s)" % (locales_path, err)]

    problems = []
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".json") or name == "en.json":
            continue
        code = name[:-len(".json")]
        if code not in known_codes:
            problems.append("%s: '%s' is not a language code in the Omarchy registry" % (name, code))
            continue
        try:
            catalog = _load(os.path.join(directory, name))
        except (OSError, ValueError) as err:
            problems.append("%s: cannot be read as JSON (%s)" % (name, err))
            continue
        if not isinstance(catalog, dict):
            problems.append("%s: must be a JSON object of key -> text" % name)
            continue
        extra = sorted(set(catalog) - set(english))
        if extra:
            problems.append("%s: keys that do not exist in en.json: %s" % (name, ", ".join(extra)))
        for key, value in catalog.items():
            if key not in english:
                continue
            if not isinstance(value, str):
                problems.append("%s: '%s' must be a string" % (name, key))
            elif sorted(PLACEHOLDER.findall(value)) != sorted(PLACEHOLDER.findall(english[key])):
                problems.append("%s: '%s' must keep exactly the placeholders of en.json (%s)"
                                % (name, key, " ".join(sorted(PLACEHOLDER.findall(english[key]))) or "none"))
    return problems


def main(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    directory = argv[1] if len(argv) > 1 else os.path.join(here, "..", "i18n")
    locales = argv[2] if len(argv) > 2 else DEFAULT_LOCALES
    problems = check(directory, locales)
    for problem in problems:
        print(problem)
    if not problems:
        print("i18n catalogs OK")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
