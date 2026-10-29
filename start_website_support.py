"""Shared static-file allowlist. Private server files are never served."""
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC_FILES = {"index.html", "home.html", "work.html", "about.html", "services.html", "contact.html", "projectrequest.html", "styles.css", "script.js", "public-config.js"}


def is_public_path(path):
    path = unquote(urlsplit(path).path).lstrip("/") or "home.html"
    target = (ROOT / path).resolve()
    if path in PUBLIC_FILES and target.parent == ROOT:
        return target.is_file()
    try:
        target.relative_to(ROOT / "assets")
    except ValueError:
        return False
    return target.is_file() and target.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico", ".mp4", ".webm", ".woff", ".woff2"}
