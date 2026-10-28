"""No real email or webhook requests: all delivery transports are mocked."""
import io
import json
from pathlib import Path
import smtplib
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from enquiry_backend import EnquiryService, EnquiryError, Settings, OWNER_EMAILS, clean_payload
from application import PortfolioApplication


class EnquiryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(smtp_username=OWNER_EMAILS[0], smtp_password="test-only-not-a-secret", smtp_from=OWNER_EMAILS[0])
        self.service = EnquiryService(self.settings, Path(self.temp.name) / "enquiries.sqlite3")
        self.data = {"name": "Test visitor", "email": "visitor@example.com", "service": "roblox", "message": "A project with <literal> text.", "preferred_contact": "email"}

    def tearDown(self):
        self.temp.cleanup()

    def rows(self):
        with self.service.connect() as db:
            return db.execute("SELECT * FROM outbox ORDER BY id").fetchall()

    def request(self, path, method="GET", data=None, origin="https://portfolio.example", key="test-request-123456"):
        body = json.dumps(data).encode() if data is not None else b""
        env = {"PATH_INFO": path, "REQUEST_METHOD": method, "HTTP_ORIGIN": origin, "HTTP_HOST": "portfolio.example", "REMOTE_ADDR": "127.0.0.1", "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": str(len(body)), "HTTP_IDEMPOTENCY_KEY": key, "wsgi.input": io.BytesIO(body)}
        headers = []
        app = PortfolioApplication(self.service)
        result = app(env, lambda status, values: headers.extend([status, dict(values)]))
        content = b"".join(result)
        if hasattr(result, "close"):
            result.close()
        return int(headers[0].split()[0]), content, headers[1]

    def test_both_owners_and_visitor_confirmation(self):
        ref = self.service.accept(self.data, "test-request-123456", "127.0.0.1")
        self.assertEqual([r["recipient"] for r in self.rows()], [*OWNER_EMAILS, "visitor@example.com"])
        self.service.send_email = Mock()
        while self.service.process_one():
            pass
        self.assertEqual(self.service.send_email.call_count, 3)
        sent = [c.args[0] for c in self.service.send_email.call_args_list]
        self.assertEqual(sent[0]["Reply-To"], "visitor@example.com")
        self.assertEqual(sent[1]["To"], OWNER_EMAILS[1])
        self.assertIn(self.data["message"], sent[0].get_content())
        self.assertEqual(sent[2]["To"], "visitor@example.com")
        self.assertEqual(sent[2]["Reply-To"], OWNER_EMAILS[0])
        self.assertIn(ref, sent[2].get_content())
        self.assertNotIn(self.data["message"], sent[2].get_content())
        self.assertTrue(all(r["state"] == "sent" for r in self.rows()))

    def test_duplicate_retry_and_payload_conflict(self):
        ref = self.service.accept(self.data, "test-request-123456", "127.0.0.1")
        self.assertEqual(ref, self.service.accept(self.data, "test-request-123456", "127.0.0.1"))
        self.assertEqual(len(self.rows()), 3)
        with self.assertRaises(EnquiryError) as error:
            self.service.accept({**self.data, "name": "Changed"}, "test-request-123456", "127.0.0.1")
        self.assertEqual(error.exception.status, 409)

    def test_invalid_inputs_and_honeypot(self):
        for overrides in [{"email": "a@example.com\r\nBcc: other@example.com"}, {"name": " "}, {"message": "x" * 5001}, {"service": "unknown"}, {"preferred_contact": "discord", "contact_handle": ""}, {"company_website": "spam"}]:
            with self.subTest(overrides=list(overrides)):
                with self.assertRaises(EnquiryError):
                    self.service.accept({**self.data, **overrides}, "test-request-123456", "127.0.0.1")
        self.assertEqual(len(self.rows()), 0)

    def test_discord_ping_is_optional_and_mentions_are_scoped(self):
        self.settings.discord_webhook = "https://discord.com/api/webhooks/123456789012345678/testtoken"
        self.settings.discord_user_id = "123456789012345678"
        data = {**self.data, "name": "@everyone", "preferred_contact": "discord", "contact_handle": "visitor-handle"}
        self.service.accept(data, "test-request-123456", "127.0.0.1")
        self.assertEqual(len(self.rows()), 4)
        self.service.send_email = Mock()
        self.service.send_discord = Mock()
        while self.service.process_one():
            pass
        payload = self.service.send_discord.call_args.args[0]
        self.assertEqual(payload["allowed_mentions"], {"parse": [], "users": ["123456789012345678"]})
        self.assertIn("<@123456789012345678>", payload["content"])
        self.assertNotIn(self.data["message"], json.dumps(payload))

    def test_webhook_cannot_be_exposed_as_a_public_discord_link(self):
        self.settings.discord_contact_url = "https://discord.com/api/webhooks/123456789012345678/testtoken"
        self.assertEqual(self.settings.public_discord_url, "")
        self.settings.discord_contact_url = "https://discord.com/users/123456789012345678"
        self.assertEqual(self.settings.public_discord_url, self.settings.discord_contact_url)

    def test_retry_does_not_repeat_successful_deliveries(self):
        self.service.accept(self.data, "test-request-123456", "127.0.0.1")
        self.service.send_email = Mock(side_effect=[smtplib.SMTPException("test failure"), None, None, None])
        while self.service.process_one():
            pass
        self.assertEqual([r["state"] for r in self.rows()], ["pending", "sent", "sent"])
        with self.service.connect() as db:
            db.execute("UPDATE outbox SET next_try=0 WHERE state='pending'")
        self.service.process_one()
        self.assertEqual(self.service.send_email.call_count, 4)
        self.assertTrue(all(r["state"] == "sent" for r in self.rows()))

    def test_missing_credentials_fails_closed(self):
        self.settings.smtp_password = ""
        code, content, _ = self.request("/api/enquiries", "POST", self.data)
        self.assertEqual(code, 503)
        self.assertNotIn("reference", json.loads(content))
        self.assertEqual(len(self.rows()), 0)

    def test_rate_limit_and_recipient_override_ignored(self):
        self.settings.max_per_email_hour = 1
        self.service.accept({**self.data, "to": "unexpected@example.com"}, "test-request-123456", "127.0.0.1")
        self.assertEqual([r["recipient"] for r in self.rows()], [*OWNER_EMAILS, "visitor@example.com"])
        with self.assertRaises(EnquiryError) as error:
            self.service.accept(self.data, "other-request-123456", "127.0.0.1")
        self.assertEqual(error.exception.status, 429)

    def test_api_acceptance_origin_and_private_files(self):
        code, body, headers = self.request("/api/enquiries", "POST", self.data)
        self.assertEqual(code, 202)
        self.assertIn("reference", json.loads(body))
        self.assertEqual(headers["Referrer-Policy"], "strict-origin-when-cross-origin")
        self.assertEqual(self.request("/api/enquiries", "POST", self.data, origin="https://other.example")[0], 403)
        for path in ["/server.env", "/server.env.example", "/data/enquiries.sqlite3", "/enquiry_backend.py", "/application.py", "/assets/../server.env", "/assets/", "/tests/test_enquiries.py"]:
            self.assertEqual(self.request(path)[0], 404, path)
        self.assertEqual(self.request("/styles.css")[0], 200)

    def test_smtp_uses_tls_and_authentication(self):
        self.service.accept(self.data, "test-request-123456", "127.0.0.1")
        message = self.service.email_message(self.rows()[0], clean_payload(self.data))
        with patch("enquiry_backend.smtplib.SMTP") as smtp:
            client = smtp.return_value.__enter__.return_value
            client.send_message.return_value = {}
            self.service.send_email(message)
            client.starttls.assert_called_once()
            client.login.assert_called_once_with(self.settings.smtp_username, self.settings.smtp_password)
            client.send_message.assert_called_once_with(message)


if __name__ == "__main__":
    unittest.main()
