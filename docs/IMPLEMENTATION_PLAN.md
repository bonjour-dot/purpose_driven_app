# Codex-ready implementation plan

## Scope

Build a new standalone Netlify web app named **Purpose Driven**:

| Purpose | Deliver |
| --- | --- |
| Fast typed and voice capture, categories, Journal, Docs-readable sync | Capture composer with category chips and speech-to-text fallback |
| Today and task awareness | Today view with task completion and due dates |
| People follow-ups | Follow-up tracker with next-contact date |
| Food, weight, exercise logs | Compact health log forms and current-day summary |
| Google-backed private records | Google sign-in, server-side token validation, Sheet rows, per-user Docs |

Exclude attachments, Drive browsing, subscriptions, social features, analytics, and broad habit/goal modules.

## Implementation sequence

1. Deploy the Apps Script in `apps-script/Code.gs` as a new project. It is a JSON API, not a user-facing app.
2. Store `APP_GATEWAY_SHARED_SECRET` in Apps Script Script Properties and Netlify environment variables.
3. Configure Google Identity Services in `public/index.html`; its client ID is public, but no client secret exists in the browser.
4. Netlify `data` Function verifies the Google credential’s issuer, audience, expiry and verified-email status. It checks the browser Origin against `ALLOWED_ORIGINS` and signs a five-minute proof for Apps Script.
5. Apps Script verifies signature and expiry before any operation. Every record includes `owner_id`; all reads and writes filter or set it from the verified token, never from browser input.
6. Apps Script creates a distinct Drive folder and a Google Doc per user, then appends readable entries only to that user’s Doc. Sheets remain the structured source of truth.
7. Test sign-in, save each log type, cross-account isolation, expired/tampered credentials, origin rejection, and Docs sync before relying on it.

## Acceptance checks

- A signed-in user can capture text, select multiple categories, and select Journal.
- A user can create/complete tasks, save a follow-up, and record food, weight, and exercise.
- Reloaded Today data comes only from that user’s rows.
- Requests without a valid Google credential fail at Netlify.
- Requests with modified/expired gateway proof fail in Apps Script.
- No secret is present in `public/`, built browser JavaScript, repository history, or browser network request payloads.
