# Private agreement drafts for LJY

Status: code prepared, not deployed or live-delivery tested. GitHub Pages cannot
run private document generation. This Google Apps Script service runs in your
Google account; it requires your authorization once.

1. Upload the separately supplied Agreement-Template.docx to a private Google
   Drive folder. Open it with Google Docs and save as a Google Docs document.
   Keep every {{PLACEHOLDER}} intact. Keep the template and output folder private.
   Never upload the agreement template to the public GitHub repository.
2. Create a standalone project at https://script.google.com/ . Paste Code.gs. The optional appsscript.json manifest is supplied with the required scopes and Singapore time zone.
3. Project Settings → Script properties: add TEMPLATE_ID (Google Docs file ID),
   OUTPUT_FOLDER_ID (private Drive folder ID), and optionally SEND_RECEIPT=true.
   These properties belong in Google, not GitHub or public-config.js.
4. Run checkSetup and authorize Drive, Docs, external export requests and email.
   Use an account that you control. Do not send OAuth tokens or passwords in chat.
5. Deploy → New deployment → Web app. Execute as yourself; allow anyone to access
   the submission endpoint. Your Google account policy must allow anonymous web
   apps; school/work accounts can restrict this. Only the endpoint is public,
   never the template, folder, draft links or generated documents.
6. Copy the deployed HTTPS URL ending in /exec. In GitHub repository Settings →
   Secrets and variables → Actions → Variables, add AGREEMENT_ENDPOINT with that
   URL. Run the Deploy portfolio to Pages workflow. Or send the public /exec URL
   to the website maintainer to connect it in public-config.js.
7. Test one request with an email you control. Both owner inboxes must receive
   the draft DOCX and PDF. Confirm the editable Drive document is private. The
   visitor should receive only a short receipt, without attachments or Drive
   links. Check every populated field, pending date, unchanged term and blank
   signature before forwarding any agreement to the client.

The form maps name/group, contact email/social handle, project type, project
scope, requested dates, proposed amount/currency, payment preference and device
requirements. The template preserves the supplied terms, including the two
small first-draft changes and 50% / 50% payment split. It leaves the final agreed
SGD price for the freelancer to confirm. The client’s budget is a proposal in
Project Details; it is not automatically treated as an accepted quote.

Owner recipients are fixed to daniljy.aep@gmail.com and denial.aep@gmail.com.
Only the owner notification has agreement attachments. The visitor receipt is
sent after the owner email call succeeds. Inbox arrival is still subject to
mail delivery. The workflow uses request IDs, 15 requests/day and 3 per email/day,
plus Google’s own quotas. Email-acknowledgement failures can still rarely cause a
duplicate owner email on retry. Execution failures are visible in Apps Script;
a failed page does not claim success. There is no background retry worker.

Until AGREEMENT_ENDPOINT is configured, the site’s existing enquiry provider is
retained and does not generate agreements. Its previous activation/delivery
problem is not solved by this prepared workflow. Do not claim automatic drafts
are active until the real end-to-end test passes.

Official documentation:
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/reference/mail/mail-app
- https://developers.google.com/apps-script/reference/document/body
- https://developers.google.com/drive/api/guides/ref-export-formats
