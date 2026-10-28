"""Build an allowlisted GitHub Pages artifact; exclude all backend data."""
import json
import os
from pathlib import Path
import shutil
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ("index.html", "home.html", "work.html", "about.html", "services.html", "contact.html", "styles.css", "script.js", "public-config.js")

def build(destination, endpoint="", agreement_endpoint=""):
    endpoint = endpoint.strip()
    if endpoint:
        parsed = urlsplit(endpoint)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.path.endswith("/api/enquiries"):
            raise ValueError("ENQUIRY_ENDPOINT must be an HTTPS URL ending in /api/enquiries, without credentials, query or fragment")
    # Retain the checked-in public Google endpoint when Actions variables are unset.
    # GitHub Pages may also deploy directly from the branch; both paths must agree.
    if not agreement_endpoint.strip():
        source = (ROOT / "public-config.js").read_text()
        prefix = "window.LJY_PUBLIC_CONFIG = Object.freeze("
        config = json.loads(source.split(prefix, 1)[1].split(");", 1)[0])
        agreement_endpoint = config.get("agreementEndpoint", "")
    agreement_endpoint = agreement_endpoint.strip()
    if agreement_endpoint:
        import re
        if not re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec", agreement_endpoint):
            raise ValueError("AGREEMENT_ENDPOINT must be a deployed Google Apps Script /exec URL")
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    for name in PUBLIC:
        shutil.copy2(ROOT / name, destination / name)
    # Copy only supported image, font and media files, never arbitrary assets.
    for source in (ROOT / "assets").rglob("*"):
        if source.is_file() and not source.is_symlink() and source.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico", ".mp4", ".webm", ".woff", ".woff2"}:
            target = destination / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    (destination / "public-config.js").write_text("window.LJY_PUBLIC_CONFIG = Object.freeze(" + json.dumps({"enquiryEndpoint": endpoint, "agreementEndpoint": agreement_endpoint}) + ");\n")
    (destination / ".nojekyll").touch()

if __name__ == "__main__":
    build(ROOT / "_site", os.environ.get("ENQUIRY_ENDPOINT", ""), os.environ.get("AGREEMENT_ENDPOINT", ""))
