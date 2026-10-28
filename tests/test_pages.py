import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_pages", ROOT / "tools/build_pages.py")
pages = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pages)


class PagesTests(unittest.TestCase):
    def test_public_artifact_and_backend_configuration(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / "site"
            pages.build(dest, "https://backend.example/api/enquiries")
            files = {p.relative_to(dest).as_posix() for p in dest.rglob("*") if p.is_file()}
            self.assertTrue(set(pages.PUBLIC).issubset(files))
            self.assertFalse(any(name.endswith((".py", ".env", ".sqlite3")) for name in files))
            self.assertFalse(any(name.startswith("data/") for name in files))
            self.assertIn("https://backend.example/api/enquiries", (dest / "public-config.js").read_text())

    def test_invalid_backend_url_is_rejected_before_output(self):
        for endpoint in ("http://backend.example/api/enquiries", "https://user:pass@backend.example/api/enquiries", "https://backend.example/wrong", "https://backend.example/api/enquiries?token=secret"):
            with tempfile.TemporaryDirectory() as temp:
                dest = Path(temp) / "site"
                with self.assertRaises(ValueError):
                    pages.build(dest, endpoint)
                self.assertFalse(dest.exists())
