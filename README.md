# LJY / Dani — motion portfolio

A five-page responsive HTML5 portfolio with separate HTML, CSS and JavaScript.
The layout fills the browser width and at least the full viewport height, with
no outer border or page margin. Internal spacing keeps the content readable.
The frontend needs no build process. Automatic enquiry email uses the included
Python backend; public deployment uses the production WSGI server in requirements.txt.
See SETUP.md to activate email and optional Discord alerts. Live sending is not yet configured.

## Open the website

Extract the complete ZIP, keeping the folder structure together.

**Windows:** double-click `START-WEBSITE.bat`. Python 3 must be installed.
The launcher starts a local server and opens the website in your default
browser. Keep the terminal window open while using the site.

**macOS / Linux:** run `python3 start-website.py` inside the folder. You can
also use your editor's local web server or ordinary static website hosting.

### YouTube Error 153

YouTube identifies Error 153 as missing HTTP Referer or equivalent client
identification. Opening HTML directly through a file URL does not provide a
normal website referrer. The local launcher supplies a real HTTP origin and
sets `Referrer-Policy: strict-origin-when-cross-origin`. Both the showreel and
project players use the actual page origin in their embed parameters.

When opened as a file, the site shows the showreel poster and direct YouTube
links instead of loading an embed that would fail. Use the launcher for inline
playback. No fake website origin or spoofed referrer is inserted.

Internet access is required for playback. If a hosted player still reports
153, check whether the hosting platform, preview iframe, browser extension or
privacy setting is stripping the referrer. The direct YouTube links remain
available. Private videos or videos with embedding disabled require separate
changes in the video's YouTube settings.

Official references:
- https://developers.google.com/youtube/iframe_api_reference#onError
- https://developers.google.com/youtube/terms/required-minimum-functionality#api-client-identity-and-credentials

### Some videos show “Video unavailable”

The standard YouTube embed player is used for compatibility, with the real
page origin and the recommended referrer policy. The official YouTube iframe
API now reports playback errors below each player. The direct YouTube link
remains available; the site does not try to bypass YouTube restrictions.

- Error 100: YouTube reports the video as unavailable or private.
- Errors 101/150: YouTube is refusing embedded playback.
- Error 153: YouTube did not receive the required website identification.
- Error 5: the player could not play the video in this browser.

All eight supplied video links returned public playability metadata with
status OK and playableInEmbed true during this update. This is a metadata
check, not a guarantee of playback for every viewer, country or browser.
If an error remains, note its video title and displayed error code. YouTube
Studio’s video Details → Show more → Allow embedding setting and the video's
Restrictions information can help diagnose video-specific failures.

The external iframe API is loaded only when an embedded player is used.
Standard YouTube embeds use YouTube's normal cookie and privacy behavior.
If the API is blocked, the basic iframe and direct watch link remain available.

### Selection and dragging

Page text selection and browser copy events are blocked outside editable form
fields. Images, links and iframe elements have native dragging disabled, and
the page blocks drag-start events outside editable fields. Visitors can still
edit, select and copy their own enquiry text.

These measures deter casual copying; they are not access control. They cannot
prevent developer tools, screenshots or copying from the cross-origin YouTube
player. The site does not cover or disable YouTube's own controls.

## Files

- `index.html` — YouTube showreel, seven selected videos and game-portfolio link.
- `work.html` — showreel, seven selected videos and five Roblox projects.
- `about.html` — Dani’s introduction, creative process and toolkit.
- `services.html` — Motion design, 2D / 3D animation, Video editing and Roblox Development, with enquiry links.
- `contact.html` — automatic enquiry submission and preferred email/Instagram/Discord reply.
- `styles.css` — shared responsive stylesheet, linked from all five HTML pages.
- `script.js` — navigation, filters, video dialogs, copy/drag guards and server-backed enquiry submission.
- `START-WEBSITE.bat` — Windows launcher (requires Python 3).
- `start-website.py` — local server, enquiry endpoint and durable delivery worker.
- `enquiry_backend.py` — SMTP email, visitor confirmation, Discord alerts and outbox.
- `application.py` — production WSGI entry point.
- `start_website_support.py` — shared public-file allowlist.
- `server.env.example` — private-service configuration template (no credentials).
- `SETUP.md` — activation and deployment instructions.
- `tests/test_enquiries.py` — mocked backend tests; no real messages are sent.
- `assets/` — original branding and available project thumbnails.

Every page imports the stylesheet with:

```html
<link rel="stylesheet" href="styles.css">
```

## Videos and categories

The home page embeds `sfqSV6F9NKE` as the main showreel. The Work page also
includes it under Video editing and Motion design. Videos with several
categories appear under each relevant filter.

| Video | YouTube ID | Categories |
| --- | --- | --- |
| Showreel 2026 | sfqSV6F9NKE | Video editing, Motion design |
| GABU | IaCJCI1SB18 | 3D |
| GALLIFREY | AnpVUnM0lK0 | 3D, Video editing |
| Whoooshy — Client Work | jYc-AO8hIhc | 2D, Motion design |
| TierIsHere — Stream Package | 2lo5arJtK6I | 3D, Motion design |
| STARSICK — Intro | -AqW9zRi0bw | 2D, Motion design |
| Police Box Test — Cinema 4D | seUZob628E4 | 3D |
| APRIL — Monthly Intro Template | fB5evK_nmb0 | 2D, Motion design |

Card titles are shortened for readability. Full video titles retrieved from
YouTube appear in the player dialog. Category assignments follow your list.

## Game credits

| Game | Credit |
| --- | --- |
| Geometric Fusion TARDIS | Personal |
| Development Build | Personal |
| 1963 | Personal |
| The Leather Doctor’s TARDIS | Provided for |
| The Thirteenth Doctor’s TARDIS Redesign | Provided for |

Game cards open the supplied Roblox pages. Available public images are used;
cards without a public image use a graphic background. No additional role or
ownership claim has been inferred for the “Provided for” projects.

## Editing

- Edit text directly in the relevant HTML page.
- Change colours in the `:root` variables in `styles.css`.
- Video cards use `data-video` for the YouTube ID, `data-title` for the full
  title, and `data-labels` for display categories. Their parent article's
  `data-category` contains space-separated filter values such as `3d motion`.
- The homepage showreel is mounted from `data-showreel` in `index.html`.
  The shared player builder in `script.js` uses the actual HTTP(S) page origin.
- Contact/social configuration is at the top of `script.js`. Instagram uses your supplied ljyaep profile link. The current YouTube channel URL
  comes from the supplied videos’ public metadata.
- The direct email link uses daniljy.aep@gmail.com. Server-side recipient routing
  sends every accepted enquiry to that address and denial.aep@gmail.com.
- SMTP and Discord webhook credentials belong in private server.env, never in
  the browser configuration. See SETUP.md.

The form posts to /api/enquiries. Accepted enquiries are stored in a private
durable outbox, with separate jobs for both owner emails and the visitor
confirmation. Optional Discord alerts are queued as well. Without SMTP
credentials the server rejects submissions rather than showing a false success.
Direct email/Instagram links and copy/download fallbacks remain available.

## References used

- [Existing portfolio](https://sites.google.com/view/denialaep/works): Dani’s
  Singapore-based bio, creator-focused work, Instagram.
- [Motion Works folder](https://drive.google.com/drive/folders/1ORN5CSGT8Ssisj3QtG7FwRSoGZRPXGYK?usp=sharing): portfolio reference and the existing motion-work collection.
- The supplied YouTube links: actual titles, channel identity and thumbnails.
- The supplied Roblox links: destinations and personal/provided-for labels.

The navy, silver and electric-blue design follows the approved wireframes.

## Verification

Checked JavaScript syntax; HTML landmarks, IDs and form controls; all local
file and anchor references; shared stylesheet/script links; image integrity;
and CSS structure. Fixture-based interaction checks cover all six filters,
multi-category assignments, file-mode fallback, origin parameters, selection
and drag guards, menu behavior, player error reporting and cleanup, focus
return, service preselection and server-backed submission success/failure.
Ten mocked backend tests cover recipients, confirmations, retries, validation,
private-file access, TLS transport and Discord notifications. Browser visual QA and
live YouTube/Roblox playback were not available in the build environment.
