# GitHub Pages email submission — FormSubmit

The live GitHub Pages form now POSTs directly to FormSubmit. It does not open an
email app and does not need a Python server, SMTP password or API key.

## One-time owner activation

1. Open https://denialaep.github.io/LJY/contact.html and submit a clearly labelled
   setup test with an email address you control. Complete FormSubmit's CAPTCHA.
2. Check daniljy.aep@gmail.com, including Spam, for the FormSubmit activation
   email. Click its activation link. Only the mailbox owner can do this.
3. Submit a fresh test after activation. Verify delivery to daniljy.aep@gmail.com,
   the CC at denial.aep@gmail.com, and the confirmation at the submitter's address.

Until activation and that delivery check are complete, email delivery has not
been verified. Do not treat an activation screen as a submitted real enquiry.

## How it works

The native HTML form uses FormSubmit with `_cc`, `_subject`, `_autoresponse` and
`_template`. The visitor's `email` field receives the autoresponse. CAPTCHA stays
enabled: FormSubmit says autoresponses do not work with AJAX or disabled CAPTCHA.
FormSubmit displays the actual submission outcome; this site does not show an
unverified success message. The form discloses the external processor to visitors.

Instagram contact and Discord reply preference remain available. Automatic
Discord pings are not enabled: a private webhook must not be embedded in public
HTML. The optional private Python backend can still provide that later.

## Optional private backend

The Python backend and Dockerfile remain available. Configure its private SMTP
settings and persistent storage using SETUP.md, then set the GitHub Actions
repository variable ENQUIRY_ENDPOINT to the real HTTPS /api/enquiries URL. The
Pages workflow injects public-config.js, and JavaScript then uses that API.
ALLOWED_ORIGINS must include https://denialaep.github.io (without /LJY).

## Repository protection

Private data and credentials remain excluded from Git tracking and the Pages
artifact. The database was removed from the current branch, but its older Git
history was not rewritten. If it contained real enquiry records, remove them
from Git history using GitHub's sensitive-data guide.

References:
- https://formsubmit.co/documentation
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
