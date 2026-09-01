import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "capture.py"
SPEC = importlib.util.spec_from_file_location("glimmer_capture", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CaptureTests(unittest.TestCase):
    def test_timecode_range(self):
        self.assertEqual(MODULE.parse_timecode("keep 1:15 - 1:25 please"), {
            "start": "1:15",
            "end": "1:25",
            "label": "1:15–1:25",
        })

    def test_site_title_uses_host_for_generic_note(self):
        self.assertEqual(MODULE.fallback_title(
            "i love this site https://www.igochi.studio/?to=menu",
            "https://www.igochi.studio/?to=menu",
            "site",
        ), "igochi.studio")


if __name__ == "__main__":
    unittest.main()

