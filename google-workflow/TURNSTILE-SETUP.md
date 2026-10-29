# Cloudflare Turnstile setup

Status: integration prepared in the review branch, not enabled. No live keys have been supplied.

1. In Cloudflare Turnstile, create a Managed widget for ljyaep.github.io. A widget can run on GitHub Pages without moving DNS to Cloudflare. Do not enter the repository path as a hostname.
2. Send the public site key to the website maintainer to put in projectrequest.html's data-turnstile-sitekey attribute. Never send the secret key in chat or commit it to GitHub.
3. In Google Apps Script Project Settings, set the private Script property TURNSTILE_SECRET_KEY. Optional TURNSTILE_HOSTNAMES is a comma-separated exact hostname allowlist, default ljyaep.github.io. The widget uses action project_request.
4. Copy the review branch's latest Code.gs and deploy a New version of the same web app. Activate both frontend and backend together, then verify one legitimate submission and one missing-token rejection. With a secret configured, the backend rejects missing, expired, reused, wrong-hostname or wrong-action tokens before creating documents or sending mail.

The site key is public; the secret is private. No paid service or billing configuration is included. Expired tokens require a fresh challenge. No captcha is displayed until a real site key is configured. An unset backend secret leaves the current service unchanged, so the integration must not be described as active until setup and real testing are complete.

Turnstile reduces form automation, not all denial-of-service attacks. GitHub Pages and Apps Script retain their platform limits. Cloudflare site-wide proxy/WAF/DDoS controls require a domain you control with proxied DNS; you cannot proxy someone else's github.io hostname. A public Apps Script endpoint is still reachable and quota exhaustion remains possible. Existing daily and per-email submission limits remain in place, and the lock wait has been shortened to avoid holding up concurrent requests.

Docs:
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
