# Purpose Driven

A mobile-first personal planning and capture app built around one clear flow:

```text
CAPTURE → PROCESS → ORGANIZE → PLAN → DO → REVIEW
```

The Today dashboard is home. Purpose Driven includes quick typed and voice capture, inbox processing, full task fields (priority, date, time, area, notes and completion history), planning horizons, people follow-ups, daily review, purpose goals, nutrition, weight, exercise and lightweight progress charts.

This repository is a standalone application. It does not edit, connect to, or migrate data from any other app.

## Architecture

```text
Browser (Google Identity token; no secret)
  -> Netlify Function (validates Google ID token + origin)
  -> signed, short-lived gateway proof
  -> Apps Script (verifies proof; scopes every query by Google subject)
  -> Google Sheet + per-user Drive folder / Docs
```

The browser never calls Apps Script directly and never receives the shared secret. Apps Script is the only component that reads/writes Sheets or Drive.

> **Before storage deployment:** Read [the account ownership policy](docs/ACCOUNT_OWNERSHIP.md). The included Apps Script prototype is deliberately disabled because it would otherwise write through the deploying account. It must be replaced with a per-user Google OAuth storage design before this app can be released to other users.

## Local preview

1. Copy `.env.example` to `.env` and supply values.
2. `npm install`
3. `npx netlify dev`

Use Netlify CLI so `/api/config` and `/api/data` route to Functions. Opening `public/index.html` directly is a visual-only preview.

## Deployment

Follow [docs/SETUP.md](docs/SETUP.md) exactly. In short: create the Google OAuth web client, deploy `apps-script/Code.gs`, set the same long secret in Script Properties and Netlify, then deploy this repository to Netlify.

## Checks

Run `npm test` after installing dependencies. The tests cover the security helpers and API request validation. Manual production checks are listed in the setup guide.
