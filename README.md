# Purpose Driven

A personal planning, capture, health and life-management app. The existing task, people, review, food, weight and exercise flows remain, alongside a configurable Today dashboard and My Direction writing space.

```text
CAPTURE → PROCESS → ORGANIZE → PLAN → DO → REVIEW
```

## Architecture

```text
Google Identity Services sign-in → Netlify verifies ID token → signed HttpOnly app session
Browser → Netlify Functions → per-Google-subject Netlify Database workspace
Separate Google Drive OAuth → encrypted refresh token in Netlify Database
Netlify → signed short-lived proof + user access token → Apps Script gateway
Apps Script → Drive API using that user's token → immutable appDataFolder snapshots
```

The browser never receives OAuth client secrets, refresh tokens or the gateway secret. The Apps Script gateway does not use its deployer's Drive, Sheets or Docs. Each write to the workspace is serialized in a transaction and retains the previous revision. A stale browser revision gets a conflict response. Drive snapshots are checked for owner, version and SHA-256 integrity before restore. Restore requires an explicit action and records the prior local state in revision history.

Netlify Database is the live workspace across devices. Google Drive is a separately authorized copy; the app does not attempt automatic two-way merge. If Drive contains a newer or divergent copy, synchronization stops and asks for review. The app requires its Netlify Database connection even when Drive is disconnected.

## Local development

1. Install Node 20.12.2 or newer and dependencies with `npm ci`.
2. Copy `.env.example` to `.env`, then fill in local values.
3. Run `netlify dev` and apply the local migration with `netlify database migrations apply`.
4. Run `npm test`.

See [setup](docs/SETUP.md) for Google Cloud, Netlify and Apps Script configuration. No production deployment is implied by this branch.
