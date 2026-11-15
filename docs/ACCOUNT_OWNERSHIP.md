# Account ownership and storage policy

## Required developer account

All developer-controlled Google resources for Purpose Driven must be created and owned by **ryan@espoirvivant.com**:

- Google Cloud project and OAuth client configuration
- Apps Script project and deployment
- Any developer-owned operational folder, logs, or configuration files

`ryan@betheltoulouse.org` must not be selected or used for these resources.

## User data ownership

Each person who uses Purpose Driven must separately authorize their own Google account. Their records must remain in their own Google Drive and must not be written to the developer account’s Drive or a shared developer spreadsheet.

The present Apps Script proof-of-concept is **not deployable for multi-user personal Drive storage** because it creates its Sheet and Docs through the deploying account. Do not deploy it until it is replaced by a per-user OAuth storage implementation.

## Required implementation direction

Use Google Identity Services in two separate steps:

1. Sign-in: validate the Google ID token at the Netlify Function.
2. Storage authorization: request a Google OAuth authorization code for the user’s Drive scopes, exchange it server-side, and store the resulting per-user credentials only in a protected server-side store.

The storage service must call Google Drive/Sheets/Docs APIs using the authenticated user’s own authorization—not a developer credential. Request the narrowest appropriate scopes, and renew or revoke consent safely.

Google’s Drive app-data scope is appropriate for private app-managed records, but it is hidden from the user’s Drive interface. A visible `Purpose Driven` folder and Google Docs journal require a suitable user-authorized Drive scope and the user’s explicit consent.

## Current audit — 15 November 2026

- No Google Cloud project ID, OAuth client ID, Apps Script deployment ID, Drive folder ID, or spreadsheet ID is stored in this repository.
- No Google resource has been created by this project.
- The available connected Drive accounts are work-domain accounts only; they have not been accessed for this app.
- The required `ryan@espoirvivant.com` Google Drive connection is not available in this workspace, so ownership cannot yet be verified or configured.
- The local Git repository was initialized with the requested GitHub remote. It has no remote branches. No commit has been made, because the local default author email is a work-domain address and must not be used without confirmation.
