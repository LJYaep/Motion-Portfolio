"""WSGI entry point for production hosting with Waitress or another WSGI server."""
import atexit
from http import HTTPStatus
import json
import logging
import mimetypes
import os
from urllib.parse import unquote, urlsplit
from wsgiref.util import FileWrapper
from enquiry_backend import EnquiryService, EnquiryError, Settings, load_environment
from pathlib import Path
from start_website_support import is_public_path

ROOT = Path(__file__).resolve().parent


class PortfolioApplication:
    def __init__(self, service):
        self.service = service

    def __call__(self, env, start_response):
        path = env.get("PATH_INFO", "/")
        method = env.get("REQUEST_METHOD", "GET")
        origin = env.get("HTTP_ORIGIN", "")
        origin_parts = urlsplit(origin)
        allowed = not origin or origin in self.service.settings.allowed_origins or (
            origin_parts.scheme in ("http", "https") and origin_parts.netloc == env.get("HTTP_HOST") and not origin_parts.username
        )
        headers = [("Referrer-Policy", "strict-origin-when-cross-origin")]
        if origin and allowed:
            headers += [("Access-Control-Allow-Origin", origin), ("Vary", "Origin")]

        def respond(code, data, extra=()):
            body = json.dumps(data).encode()
            start_response(f"{code} {HTTPStatus(code).phrase}", headers + [("Content-Type", "application/json; charset=utf-8"), ("Content-Length", str(len(body))), ("Cache-Control", "no-store")] + list(extra))
            return [body] if method != "HEAD" else []

        if path.startswith("/api/"):
            if not allowed:
                return respond(403, {"error": "Please submit from the portfolio website."})
            if method == "OPTIONS":
                start_response("204 No Content", headers + [("Access-Control-Allow-Methods", "POST, GET, OPTIONS"), ("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key")])
                return []
            if path == "/api/config" and method == "GET":
                return respond(200, {"emailConfigured": self.service.settings.email_ready, "discordContactUrl": self.service.settings.public_discord_url})
            if path != "/api/enquiries" or method != "POST":
                return respond(404, {"error": "Not found."})
            try:
                length = int(env.get("CONTENT_LENGTH", "0") or "0")
                if length <= 0 or length > 16000:
                    raise EnquiryError("Please shorten your enquiry and try again.", 413)
                if env.get("CONTENT_TYPE", "").split(";")[0] != "application/json":
                    raise EnquiryError("Please submit using the enquiry form.", 415)
                data = json.loads(env["wsgi.input"].read(length).decode("utf-8"))
                reference = self.service.accept(data, env.get("HTTP_IDEMPOTENCY_KEY", ""), env.get("REMOTE_ADDR", "unknown"))
                return respond(202, {"reference": reference, "message": "Your enquiry has been submitted. A confirmation email will follow."})
            except EnquiryError as error:
                return respond(error.status, {"error": str(error)})
            except (ValueError, UnicodeError):
                return respond(400, {"error": "Please check the form and try again."})
            except Exception as error:
                logging.error("Enquiry request failed: %s", type(error).__name__)
                return respond(500, {"error": "Your enquiry could not be submitted. Please try again or contact me directly."})

        if method not in ("GET", "HEAD") or not is_public_path(path):
            return respond(404, {"error": "Not found."})
        target = ROOT / (unquote(path).lstrip("/") or "index.html")
        try:
            stream = target.open("rb")
        except OSError:
            return respond(404, {"error": "Not found."})
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in (".html", ".css", ".js"):
            content_type += "; charset=utf-8"
        start_response("200 OK", headers + [("Content-Type", content_type), ("Content-Length", str(target.stat().st_size))])
        if method == "HEAD":
            stream.close()
            return []
        return FileWrapper(stream)


def create_app():
    load_environment(ROOT / "server.env")
    database = os.environ.get("ENQUIRY_DB_PATH") or str(ROOT / "data" / "enquiries.sqlite3")
    service = EnquiryService(Settings.from_environment(), database)
    stop_event, _ = service.start_worker()
    atexit.register(stop_event.set)
    return PortfolioApplication(service)
