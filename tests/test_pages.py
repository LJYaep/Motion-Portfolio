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

    def test_checked_in_google_endpoint_survives_default_build(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / "site"
            pages.build(dest)
            config = (dest / "public-config.js").read_text()
            self.assertIn("https://script.google.com/macros/s/AKfycbwCfJTY6RK6Xvwf6XIm9XL1kLRB6gtlv19z3QVitkSTY-XmfnqTpYRwFZYZlXnfKvrgrQ/exec", config)
            html = (dest / "contact.html").read_text()
            self.assertIn('action="https://script.google.com/macros/s/AKfycbwCfJTY6RK6Xvwf6XIm9XL1kLRB6gtlv19z3QVitkSTY-XmfnqTpYRwFZYZlXnfKvrgrQ/exec"', html)
            self.assertNotIn("formsubmit.co", html)

    def test_explicit_agreement_endpoint_overrides_default(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / "site"
            endpoint = "https://script.google.com/macros/s/test-deployment/exec"
            pages.build(dest, agreement_endpoint=endpoint)
            self.assertIn(endpoint, (dest / "public-config.js").read_text())
