"""Server-side enquiry delivery. Standard-library only; never import in the browser."""
from dataclasses import dataclass
from contextlib import contextmanager
from email.message import EmailMessage
from email.utils import formatdate
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import hashlib
import json
import logging
import os
import re
import smtplib
import sqlite3
import ssl
import threading
import time
import uuid

OWNER_EMAILS = ("daniljy.aep@gmail.com", "denial.aep@gmail.com")
SERVICES = {"motion": "Motion design", "animation": "2D / 3D motion graphics", "editing": "Video editing", "roblox": "Roblox building / modelling", "modelling": "Modelling", "discuss": "Discuss first", "other": "Something else"}
EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$")


class EnquiryError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def load_environment(path):
    """A tiny env-file reader. Existing process environment takes precedence."""
    path = Path(path)
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            os.environ.setdefault(name, value.strip().strip('"').strip("'"))


@dataclass
class Settings:
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_ssl: bool = False
    discord_webhook: str = ""
    discord_user_id: str = ""
    discord_contact_url: str = ""
    allowed_origins: tuple = ()
    max_per_ip_hour: int = 5
    max_per_email_hour: int = 3
    max_total_hour: int = 30

    @classmethod
    def from_environment(cls):
        return cls(
            smtp_host=os.environ.get("SMTP_HOST", "smtp.gmail.com"),
            smtp_port=int(os.environ.get("SMTP_PORT", "587")),
            smtp_username=os.environ.get("SMTP_USERNAME", ""),
            smtp_password=os.environ.get("SMTP_PASSWORD", "").replace(" ", "") if os.environ.get("SMTP_HOST", "smtp.gmail.com") == "smtp.gmail.com" else os.environ.get("SMTP_PASSWORD", ""),
            smtp_from=os.environ.get("SMTP_FROM", os.environ.get("SMTP_USERNAME", "")),
            smtp_ssl=os.environ.get("SMTP_SSL", "false").lower() == "true",
            discord_webhook=os.environ.get("DISCORD_WEBHOOK_URL", ""),
            discord_user_id=os.environ.get("DISCORD_NOTIFY_USER_ID", ""),
            discord_contact_url=os.environ.get("DISCORD_CONTACT_URL", ""),
            allowed_origins=tuple(x.strip().rstrip("/") for x in os.environ.get("ALLOWED_ORIGINS", "").split(",") if x.strip()),
        )

    @property
    def email_ready(self):
        return bool(self.smtp_host and self.smtp_username and self.smtp_password and EMAIL.fullmatch(self.smtp_from))

    @property
    def webhook_ready(self):
        return bool(re.fullmatch(r"https://discord\.com/api(?:/v\d+)?/webhooks/\d+/[A-Za-z0-9_.-]+", self.discord_webhook))

    @property
    def public_discord_url(self):
        parsed = urlsplit(self.discord_contact_url)
        public_path = (parsed.hostname == "discord.com" and re.fullmatch(r"/(?:users/\d{17,20}|invite/[A-Za-z0-9-]+)/?", parsed.path)) or (parsed.hostname == "discord.gg" and re.fullmatch(r"/[A-Za-z0-9-]+/?", parsed.path))
        if parsed.scheme == "https" and public_path and not parsed.username and not parsed.query and not parsed.fragment:
            return self.discord_contact_url
        return ""


def clean_payload(raw):
    if not isinstance(raw, dict):
        raise EnquiryError("Please check your enquiry and try again.")
    if raw.get("company_website"):
        raise EnquiryError("This submission could not be accepted.")
    limits = {"name": 100, "email": 254, "service": 30, "budget": 100, "timeline": 100, "message": 5000, "preferred_contact": 20, "contact_handle": 100}
    data = {}
    for key, limit in limits.items():
        value = raw.get(key, "")
        if not isinstance(value, str) or len(value) > limit:
            raise EnquiryError(f"Please check the {key.replace('_', ' ')} field.")
        value = value.strip()
        if "\x00" in value or (key != "message" and ("\r" in value or "\n" in value)):
            raise EnquiryError("Please remove line breaks from the contact fields.")
        data[key] = value
    if not data["name"] or not data["message"] or not EMAIL.fullmatch(data["email"]):
        raise EnquiryError("Please enter your name, a valid email address and project details.")
    if data["service"] not in SERVICES:
        raise EnquiryError("Please select a service.")
    data["preferred_contact"] = data["preferred_contact"] or "email"
    if data["preferred_contact"] not in ("email", "instagram", "discord"):
        raise EnquiryError("Please select a valid contact method.")
    if data["preferred_contact"] != "email" and not data["contact_handle"]:
        raise EnquiryError("Please enter your Discord or Instagram handle.")
    return data


class EnquiryService:
    def __init__(self, settings, database):
        self.settings = settings
        self.database = Path(database)
        self.database.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS enquiries (
                    id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL,
                    payload_hash TEXT NOT NULL, payload TEXT NOT NULL,
                    created REAL NOT NULL, ip_hash TEXT NOT NULL, email_hash TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, enquiry_id TEXT NOT NULL,
                    kind TEXT NOT NULL, recipient TEXT NOT NULL DEFAULT '',
                    state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
                    next_try REAL NOT NULL, sent_at REAL, last_error TEXT,
                    UNIQUE(enquiry_id, kind, recipient)
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def accept(self, raw, request_key, ip_address):
        data = clean_payload(raw)
        if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", request_key or ""):
            raise EnquiryError("Please refresh the page and submit again.")
        if not self.settings.email_ready:
            raise EnquiryError("Online enquiries are temporarily unavailable. Please email me or contact me on Instagram.", 503)
        payload = json.dumps(data, sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(payload.encode()).hexdigest()
        ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()
        email_hash = hashlib.sha256(data["email"].lower().encode()).hexdigest()
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT id, payload_hash FROM enquiries WHERE request_key=?", (request_key,)).fetchone()
            if previous:
                if previous["payload_hash"] != digest:
                    raise EnquiryError("Please refresh the form before submitting a different enquiry.", 409)
                return previous["id"]
            counts = db.execute("""SELECT COUNT(*) total,
                COALESCE(SUM(ip_hash=?),0) ip_total, COALESCE(SUM(email_hash=?),0) email_total
                FROM enquiries WHERE created>?""", (ip_hash, email_hash, now - 3600)).fetchone()
            if counts["total"] >= self.settings.max_total_hour or counts["ip_total"] >= self.settings.max_per_ip_hour or counts["email_total"] >= self.settings.max_per_email_hour:
                raise EnquiryError("Please wait before submitting another enquiry, or contact me directly.", 429)
            enquiry_id = str(uuid.uuid4())
            db.execute("INSERT INTO enquiries VALUES (?,?,?,?,?,?,?)", (enquiry_id, request_key, digest, payload, now, ip_hash, email_hash))
            for recipient in OWNER_EMAILS:
                db.execute("INSERT INTO outbox(enquiry_id,kind,recipient,next_try) VALUES (?,?,?,?)", (enquiry_id, "owner_email", recipient, now))
            db.execute("INSERT INTO outbox(enquiry_id,kind,recipient,next_try) VALUES (?,?,?,?)", (enquiry_id, "confirmation", data["email"], now))
            if self.settings.webhook_ready:
                db.execute("INSERT INTO outbox(enquiry_id,kind,next_try) VALUES (?,?,?)", (enquiry_id, "discord", now))
        return enquiry_id

    def details_text(self, data, enquiry_id):
        return "\n".join([
            f"Reference: {enquiry_id}", f"Name: {data['name']}", f"Email: {data['email']}",
            f"Service: {SERVICES[data['service']]}", f"Budget: {data['budget'] or 'To be discussed'}",
            f"Timeline: {data['timeline'] or 'To be discussed'}", f"Preferred reply: {data['preferred_contact'].title()}",
            f"Social handle: {data['contact_handle'] or 'Not supplied'}", "", "Project details", data["message"]
        ])

    def email_message(self, job, data):
        message = EmailMessage()
        message["From"] = f"LJY Portfolio <{self.settings.smtp_from}>"
        message["To"] = job["recipient"]
        message["Date"] = formatdate(localtime=False)
        domain = self.settings.smtp_from.rsplit("@", 1)[-1]
        # Stable message IDs help mail systems identify delivery retries.
        message["Message-ID"] = f"<ljy-{job['enquiry_id']}-{job['id']}@{domain}>"
        if job["kind"] == "confirmation":
            message["Subject"] = "Your enquiry has been received | LJY"
            message["Reply-To"] = OWNER_EMAILS[0]
            # Do not reflect arbitrary visitor text into an automatic email to a third party.
            message.set_content(f"Hi {data['name']},\n\nThank you for contacting LJY. Your project enquiry has been received.\n\nReference: {job['enquiry_id']}\nService: {SERVICES[data['service']]}\nPreferred reply: {data['preferred_contact'].title()}\n\nI'll review your enquiry and reply using your preferred contact details.\nIf you did not submit an enquiry, you can ignore this message.\n\nLJY / Dani\nhttps://www.instagram.com/ljyaep/\n")
        else:
            message["Subject"] = f"New portfolio enquiry: {SERVICES[data['service']]}"
            message["Reply-To"] = data["email"]
            message.set_content(self.details_text(data, job["enquiry_id"]))
        return message

    def send_email(self, message):
        config = self.settings
        context = ssl.create_default_context()
        if config.smtp_ssl:
            client = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port, timeout=20, context=context)
        else:
            client = smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=20)
        with client as connection:
            connection.ehlo()
            if not config.smtp_ssl:
                connection.starttls(context=context)
                connection.ehlo()
            connection.login(config.smtp_username, config.smtp_password)
            refused = connection.send_message(message)
            if refused:
                raise smtplib.SMTPRecipientsRefused(refused)

    def discord_payload(self, data, enquiry_id):
        user_id = self.settings.discord_user_id
        mention = f"<@{user_id}> " if re.fullmatch(r"\d{17,20}", user_id) else ""
        return {
            "username": "LJY enquiries",
            "content": f"{mention}New portfolio enquiry received. Full details have been queued to both email inboxes.",
            "allowed_mentions": {"parse": [], "users": [user_id] if mention else []},
            "embeds": [{"title": "New project enquiry", "color": 480504,
                "fields": [
                    {"name": "Name", "value": data["name"], "inline": True},
                    {"name": "Service", "value": SERVICES[data["service"]], "inline": True},
                    {"name": "Preferred contact", "value": data["preferred_contact"].title(), "inline": True},
                    {"name": "Reference", "value": enquiry_id}
                ]}]
        }

    def send_discord(self, payload):
        # The webhook is private server configuration, never supplied by visitors.
        url = self.settings.discord_webhook + "?wait=true"
        request = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "User-Agent": "LJYPortfolio/1.0"}, method="POST")
        with urlopen(request, timeout=15) as response:
            if response.status not in (200, 204):
                raise RuntimeError("DiscordDeliveryError")

    def process_one(self):
        if not self.settings.email_ready:
            return False
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            # Recover jobs interrupted by a process restart after a five-minute lease.
            db.execute("UPDATE outbox SET state='pending' WHERE state='processing' AND next_try<?", (now,))
            job = db.execute("SELECT * FROM outbox WHERE state='pending' AND next_try<=? ORDER BY id LIMIT 1", (now,)).fetchone()
            if not job:
                return False
            db.execute("UPDATE outbox SET state='processing',next_try=? WHERE id=?", (now + 300, job["id"]))
            enquiry = db.execute("SELECT payload FROM enquiries WHERE id=?", (job["enquiry_id"],)).fetchone()
        data = json.loads(enquiry["payload"])
        try:
            if job["kind"] == "discord":
                self.send_discord(self.discord_payload(data, job["enquiry_id"]))
            else:
                self.send_email(self.email_message(job, data))
        except Exception as error:
            attempts = job["attempts"] + 1
            state = "failed" if attempts >= 8 else "pending"
            with self.connect() as db:
                db.execute("UPDATE outbox SET state=?,attempts=?,next_try=?,last_error=? WHERE id=?", (state, attempts, time.time() + min(3600, 30 * 2 ** attempts), type(error).__name__, job["id"]))
            logging.warning("Enquiry delivery %s: %s (%s)", job["id"], state, type(error).__name__)
        else:
            with self.connect() as db:
                db.execute("UPDATE outbox SET state='sent',sent_at=?,last_error=NULL WHERE id=?", (time.time(), job["id"]))
        return True

    def run_worker(self, stop_event):
        while not stop_event.is_set():
            try:
                if not self.process_one():
                    stop_event.wait(1)
            except Exception as error:
                logging.error("Enquiry worker: %s", type(error).__name__)
                stop_event.wait(5)

    def start_worker(self):
        stop_event = threading.Event()
        worker = threading.Thread(target=self.run_worker, args=(stop_event,), daemon=True)
        worker.start()
        return stop_event, worker
