# Fix the live LJY GitHub Pages deployment

These files are prepared changes, not an already deployed fix.

## 1. Remove private runtime files from the public repository

In your local checkout of denialaep/LJY, copy this package over the website files,
including .gitignore and .github/workflows/pages.yml. Then run:

```sh
git rm -r --cached --ignore-unmatch data __pycache__ server.env .env
```

This removes these paths from Git tracking while retaining local copies. Review
`git diff --cached --stat`, then commit and push the changed files. A .gitignore
alone does not remove files already tracked. If real enquiry records were
committed, removing them in a new commit does not erase Git history: clean those
paths from history following GitHub's sensitive-data removal guide before
considering the exposure resolved. Do not upload your local data directory.

## 2. Publish only the frontend

GitHub repository Settings → Pages → Build and deployment → Source: GitHub
Actions. Run the Deploy portfolio to Pages workflow. It builds `_site` from an
explicit file allowlist; Python source, settings and databases are excluded.
Until a backend URL is configured the form prepares an email addressed to both
owners, clearly states that nothing has been submitted, and does not POST to a
nonexistent GitHub endpoint. Manual email does not send an automatic receipt.

## 3. Host the email backend

Use a Python/Docker host with persistent storage and outbound SMTP support.
The included Dockerfile listens on port 8080. Attach persistent storage at
`/data`; configure HTTPS using the host's proxy. Do not use ephemeral storage
for enquiry records. Host charges and account setup depend on your provider.

Set private environment values from server.env.example on that host:

- SMTP_HOST, SMTP_PORT, SMTP_SSL, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM
- ALLOWED_ORIGINS=https://denialaep.github.io (no /LJY path)
- ENQUIRY_DB_PATH=/data/enquiries.sqlite3
- Optional DISCORD_WEBHOOK_URL, DISCORD_NOTIFY_USER_ID, DISCORD_CONTACT_URL

Do not enter passwords or a webhook in GitHub public files. See SETUP.md for
Gmail app-password instructions. The backend sends to daniljy.aep@gmail.com,
denial.aep@gmail.com, and sends a confirmation to the submitter.

## 4. Connect the frontend

Repository Settings → Secrets and variables → Actions → Variables → New
repository variable: `ENQUIRY_ENDPOINT` = your backend's real HTTPS URL ending
in `/api/enquiries`. This URL is public, not a secret. Re-run the Pages workflow.
The workflow writes public-config.js automatically. For manual uploads, set the
same URL in public-config.js yourself. Never invent a backend URL.

Check that GET /api/config at your backend returns emailConfigured: true.
Submit one real test from https://denialaep.github.io/LJY/contact.html and verify
both owner inboxes, the visitor receipt and optional Discord notification.
A submitted reference means durably queued; it does not guarantee inbox arrival.
No live email has been sent or verified by this update.

Official guides:
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
