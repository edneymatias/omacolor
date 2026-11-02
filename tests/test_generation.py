import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.join(HERE, "..")
sys.path.insert(0, os.path.join(PLUGIN, "lib"))

import omacolor_profile as cp  # noqa: E402


def read_bytes(path):
    with open(path, "rb") as handle:
        return handle.read()


def load_presets():
    with open(os.path.join(PLUGIN, "presets.json")) as handle:
        return json.load(handle)


class Layout(unittest.TestCase):
    """The plugin keeps everything it creates in its own folder (.data/), so `omarchy plugin remove`
    deletes it; the user's profiles live in ~/.local/share/icc and are only ever read."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.generated = os.path.join(self.tmp.name, "plugin", ".data", "generated")
        self.user_dir = os.path.join(self.tmp.name, "icc")
        os.makedirs(self.user_dir)
        self.user_icc = os.path.join(self.user_dir, "calibrated.icc")
        with open(self.user_icc, "wb") as handle:
            handle.write(b"a profile the user paid for")

    def mtimes(self, paths):
        return [os.stat(p).st_mtime_ns for p in paths]

    def test_generating_never_touches_the_user_profiles(self):
        before = (read_bytes(self.user_icc), os.stat(self.user_icc).st_mtime_ns, sorted(os.listdir(self.user_dir)))
        cp.generate_presets(load_presets(), self.generated)
        after = (read_bytes(self.user_icc), os.stat(self.user_icc).st_mtime_ns, sorted(os.listdir(self.user_dir)))
        self.assertEqual(after, before)

    def test_generating_twice_does_not_rewrite_unchanged_presets(self):
        paths = cp.generate_presets(load_presets(), self.generated)
        before = self.mtimes(paths)
        cp.generate_presets(load_presets(), self.generated)
        self.assertEqual(self.mtimes(paths), before)

    def test_a_changed_preset_is_written_again(self):
        paths = cp.generate_presets(load_presets(), self.generated)
        with open(paths[0], "wb") as handle:
            handle.write(b"garbage")
        cp.generate_presets(load_presets(), self.generated)
        self.assertTrue(cp.check_icc(read_bytes(paths[0])))

    def test_edid_profile_twice_does_not_rewrite(self):
        edid = read_bytes(os.path.join(HERE, "fixtures", "boe-ne156fhm-nx9.edid"))
        out = os.path.join(self.generated, "edid-boe.icc")
        cp.generate_edid_profile(edid, out)
        before = self.mtimes([out])
        cp.generate_edid_profile(edid, out)
        self.assertEqual(self.mtimes([out]), before)


class RuntimeDataStaysOutOfGit(unittest.TestCase):
    def test_plugin_gitignore_ignores_the_data_folder(self):
        # `omarchy plugin update` only fast-forwards; untracked .data/ survives updates, and
        # `omarchy plugin remove` deletes the folder with it.
        path = os.path.join(PLUGIN, ".gitignore")
        self.assertTrue(os.path.exists(path), "plugin/.gitignore is missing")
        with open(path) as handle:
            self.assertIn(".data/", handle.read().split())


if __name__ == "__main__":
    unittest.main()
