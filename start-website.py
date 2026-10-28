"""Portfolio web server and enquiry endpoint. Run with Python 3."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser
import json
import logging
import os
from urllib.parse import urlsplit
from enquiry_backend import EnquiryService, EnquiryError, Settings, load_environment

ROOT = Path(__file__).resolve().parent
from start_website_support import is_public_path


class PortfolioHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        if origin in self.server.application.settings.allowed_origins:
            return True
        parts = urlsplit(origin)
        return parts.scheme in ("http", "https") and parts.netloc == self.headers.get("Host") and not parts.username

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if self.headers.get("Origin") and self.origin_allowed():
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/config":
            if not self.origin_allowed():
                self.send_json(403, {"error": "This origin is not allowed."})
                return
            settings = self.server.application.settings
            self.send_json(200, {"emailConfigured": settings.email_ready, "discordContactUrl": settings.public_discord_url})
            return
        if not is_public_path(self.path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not is_public_path(self.path):
            self.send_error(404)
            return
        super().do_HEAD()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def do_OPTIONS(self):
        if not self.origin_allowed():
            self.send_json(403, {"error": "This origin is not allowed."})
            return
        self.send_response(204)
        if self.headers.get("Origin"):
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key")
        self.end_headers()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/enquiries":
            self.send_json(404, {"error": "Not found."})
            return
        if not self.origin_allowed():
            self.send_json(403, {"error": "Please submit from the portfolio website."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16000:
                raise EnquiryError("Please shorten your enquiry and try again.", 413)
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                raise EnquiryError("Please submit using the enquiry form.", 415)
            raw = json.loads(self.rfile.read(length).decode("utf-8"))
            reference = self.server.application.accept(raw, self.headers.get("Idempotency-Key", ""), self.client_address[0])
            self.send_json(202, {"reference": reference, "message": "Your enquiry has been submitted. A confirmation email will follow."})
        except EnquiryError as error:
            self.send_json(error.status, {"error": str(error)})
        except (ValueError, UnicodeError):
            self.send_json(400, {"error": "Please check the form and try again."})
        except Exception as error:
            logging.error("Enquiry request failed: %s", type(error).__name__)
            self.send_json(500, {"error": "Your enquiry could not be submitted. Please try again or contact me directly."})


def main():
    load_environment(ROOT / "server.env")
    settings = Settings.from_environment()
    database = os.environ.get("ENQUIRY_DB_PATH") or str(ROOT / "data" / "enquiries.sqlite3")
    service = EnquiryService(settings, database)
    directory = str(ROOT)
    handler = partial(PortfolioHandler, directory=directory)
    # Let the operating system allocate a free port; do not interfere with
    # another local website that might already be using port 8000.
    host = os.environ.get("BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "0"))
    with ThreadingHTTPServer((host, port), handler) as server:
        server.application = service
        worker_stop, worker = service.start_worker()
        url = f"http://127.0.0.1:{server.server_port}/index.html"
        print("LJY portfolio is running.")
        print(f"Open: {url}")
        print("Enquiry email:", "configured" if settings.email_ready else "not configured; complete server.env to enable")
        print("Discord alerts:", "configured" if settings.webhook_ready else "not configured (optional)")
        print("Keep this window open. Press Ctrl+C to stop the website.")
        if host in ("127.0.0.1", "localhost"):
            opener = threading.Timer(0.5, webbrowser.open, args=(url,))
            opener.daemon = True
            opener.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nWebsite stopped.")
        finally:
            worker_stop.set()
            worker.join(timeout=5)


if __name__ == "__main__":
    main()
