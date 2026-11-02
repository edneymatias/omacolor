import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))

import omacolor_profile as cp  # noqa: E402

FIXTURE = os.path.join(HERE, "fixtures", "boe-ne156fhm-nx9.edid")
PRESETS = os.path.join(HERE, "..", "presets.json")
SRGB = {"r": [0.640, 0.330], "g": [0.300, 0.600], "b": [0.150, 0.060]}
D65 = [0.3127, 0.3290]


def read_bytes(path):
    with open(path, "rb") as handle:
        return handle.read()


def load_presets():
    with open(PRESETS) as f:
        return json.load(f)


def good_profile():
    return cp.build_icc(SRGB, D65, {"type": "srgb"}, "test srgb")


class ParseEdid(unittest.TestCase):
    def test_parse_edid_boe(self):
        info = cp.parse_edid(read_bytes(FIXTURE))
        self.assertEqual(info["make"], "BOE")
        self.assertEqual(info["product"], 0x0C29)
        for key, want in (("r", (0.6503, 0.3291)), ("g", (0.3056, 0.6250)), ("b", (0.1533, 0.0556))):
            for got, exp in zip(info["primaries"][key], want):
                self.assertAlmostEqual(got, exp, delta=0.001, msg=key)
        for got, exp in zip(info["white"], (0.3125, 0.3291)):
            self.assertAlmostEqual(got, exp, delta=0.001)
        self.assertAlmostEqual(info["gamma"], 2.2, places=2)

    def test_parse_edid_rejects_short(self):
        with self.assertRaises(ValueError):
            cp.parse_edid(b"\0" * 64)

    def test_parse_edid_rejects_zero_chromaticities(self):
        data = bytearray(read_bytes(FIXTURE))
        data[25:35] = b"\0" * 10  # virtual displays carry no chromaticities
        with self.assertRaises(ValueError):
            cp.parse_edid(bytes(data))


class DefectiveEdid(unittest.TestCase):
    """A monitor can send chromaticities that make no sense; the helper must say so cleanly."""

    def fixture_with(self, values):
        # values: (rx, ry, gx, gy, bx, by, wx, wy) as 10-bit integers; low bits set to 0.
        data = bytearray(read_bytes(FIXTURE))
        data[25] = 0
        data[26] = 0
        for i, v in enumerate(values):
            data[27 + i] = v >> 2
        return bytes(data)

    def test_a_primary_with_zero_y_is_rejected(self):
        data = self.fixture_with((666, 0, 313, 640, 157, 57, 320, 337))
        with self.assertRaises(ValueError):
            cp.parse_edid(data)

    def test_collinear_primaries_are_rejected(self):
        data = self.fixture_with((400, 400, 500, 500, 600, 600, 320, 337))
        with self.assertRaises(ValueError):
            cp.parse_edid(data)

    def test_edid_profile_of_a_defective_edid_raises_value_error(self):
        data = self.fixture_with((666, 0, 313, 640, 157, 57, 320, 337))
        with tempfile.TemporaryDirectory() as out:
            with self.assertRaises(ValueError):
                cp.generate_edid_profile(data, os.path.join(out, "x.icc"))


class Icc(unittest.TestCase):
    def test_build_icc_passes_check(self):
        data = good_profile()
        self.assertTrue(cp.check_icc(data))
        self.assertFalse(cp.check_icc(b"\0" * 200))
        wrong_size = struct.pack(">I", len(data) + 1) + data[4:]
        self.assertFalse(cp.check_icc(wrong_size))

    def test_gamma_profile_passes_check(self):
        data = cp.build_icc(SRGB, D65, {"type": "gamma", "value": 2.19921875}, "adobe-like")
        self.assertTrue(cp.check_icc(data))

    def test_presets_generated(self):
        with tempfile.TemporaryDirectory() as out:
            paths = cp.generate_presets(load_presets(), out)
            names = [os.path.basename(p) for p in paths]
            self.assertEqual(names, ["srgb.icc", "display-p3.icc", "adobe-rgb.icc", "rec709.icc", "rec2020.icc"])
            for p in paths:
                self.assertTrue(cp.check_icc(read_bytes(p)), p)

    def test_edid_profile_generated(self):
        with tempfile.TemporaryDirectory() as out:
            path = os.path.join(out, "edid.icc")
            self.assertEqual(cp.generate_edid_profile(read_bytes(FIXTURE), path), path)
            self.assertTrue(cp.check_icc(read_bytes(path)))


class Validate(unittest.TestCase):
    def write(self, data):
        fd, path = tempfile.mkstemp(suffix=".icc")
        os.write(fd, data)
        os.close(fd)
        self.addCleanup(os.unlink, path)
        return path

    def test_validate_profile_zeros_rejected(self):
        result = cp.validate_profile(self.write(b"\0" * 200))
        self.assertFalse(result["ok"])
        self.assertTrue(result["reason"])

    def test_validate_profile_good_accepted(self):
        result = cp.validate_profile(self.write(good_profile()))
        self.assertTrue(result["ok"])
        self.assertIn(result["checked"], ("header", "full"))

    def test_validate_profile_truncated_rejected(self):
        result = cp.validate_profile(self.write(good_profile()[:300]))
        self.assertFalse(result["ok"])

    @unittest.skipUnless(shutil.which("transicc"), "transicc (lcms2) not installed")
    def test_validate_profile_full_catches_broken_tag_table(self):
        data = bytearray(good_profile())
        data[128:132] = struct.pack(">I", 0x7FFFFFFF)  # absurd tag count, header still valid
        result = cp.validate_profile(self.write(bytes(data)))
        self.assertTrue(cp.check_icc(bytes(data)))
        self.assertFalse(result["ok"])
        self.assertEqual(result["checked"], "full")

    @unittest.skipUnless(shutil.which("transicc"), "transicc (lcms2) not installed")
    def test_transicc_smoke(self):
        path = self.write(good_profile())
        out = subprocess.run(["transicc", "-i", path, "-o", path, "-t1"], input="0.5 0.5 0.5\n",
                             capture_output=True, text=True).stdout
        value = float(out.split("R=")[1].split()[0])
        self.assertAlmostEqual(value, 0.5, delta=0.002)


class ListUser(unittest.TestCase):
    def test_list_user_profiles_returns_only_icc_files_sorted(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ("b.icc", "A.ICC", "notes.txt"):
                with open(os.path.join(folder, name), "wb") as handle:
                    handle.write(b"x")
            os.mkdir(os.path.join(folder, "dir.icc"))
            listed = cp.list_user_profiles(folder)
            self.assertEqual([e["name"] for e in listed], ["A.ICC", "b.icc"])
            self.assertEqual(listed[0]["path"], os.path.join(folder, "A.ICC"))

    def test_list_user_profiles_missing_folder_is_empty(self):
        self.assertEqual(cp.list_user_profiles("/nonexistent/omacolor-test"), [])


class Cli(unittest.TestCase):
    def test_list_user_command_prints_json(self):
        script = os.path.join(HERE, "..", "bin", "omacolor-profile")
        with tempfile.TemporaryDirectory() as folder:
            with open(os.path.join(folder, "casa.icc"), "wb") as handle:
                handle.write(b"x")
            proc = subprocess.run([sys.executable, script, "list-user", folder], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual([e["name"] for e in json.loads(proc.stdout)], ["casa.icc"])

    def test_check_exit_code_and_json(self):
        script = os.path.join(HERE, "..", "bin", "omacolor-profile")
        with tempfile.NamedTemporaryFile(suffix=".icc") as bad:
            bad.write(b"\0" * 200)
            bad.flush()
            proc = subprocess.run([sys.executable, script, "check", bad.name], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 1)
        self.assertFalse(json.loads(proc.stdout)["ok"])

    def test_presets_command_writes_files(self):
        script = os.path.join(HERE, "..", "bin", "omacolor-profile")
        with tempfile.TemporaryDirectory() as out:
            proc = subprocess.run([sys.executable, script, "presets", "--out", out], capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertEqual(sorted(os.listdir(out)),
                             ["adobe-rgb.icc", "display-p3.icc", "rec2020.icc", "rec709.icc", "srgb.icc"])

    def test_edid_info_rejects_bad_port(self):
        script = os.path.join(HERE, "..", "bin", "omacolor-profile")
        proc = subprocess.run([sys.executable, script, "edid-info", "../etc"], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 1)


if __name__ == "__main__":
    unittest.main()
