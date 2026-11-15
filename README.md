# Purpose Driven

A mobile-first personal planning and capture app for capturing what matters and following through: tasks, people follow-ups, food, weight, and exercise.

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

> **Before deployment:** Read [the account ownership policy](docs/ACCOUNT_OWNERSHIP.md). The included Apps Script prototype currently writes through the deploying account and must be replaced with per-user Google OAuth storage before this app can be released to other users.

## Local preview

1. Copy `.env.example` to `.env` and supply values.
2. `npm install`
3. `npx netlify dev`

Use Netlify CLI so `/api/data` routes to the Function. Opening `public/index.html` directly is a visual-only preview.

## Deployment

Follow [docs/SETUP.md](docs/SETUP.md) exactly. In short: create the Google OAuth web client, deploy `apps-script/Code.gs`, set the same long secret in Script Properties and Netlify, then deploy this repository to Netlify.

## Checks

Run `npm test` after installing dependencies. The tests cover the security helpers and API request validation. Manual production checks are listed in the setup guide.
