# Deployment and security setup

> **Do not deploy the current backend yet.** It is intentionally disabled until its storage layer is refactored to use each signed-in user’s own Google Drive authorization. See [ACCOUNT_OWNERSHIP.md](ACCOUNT_OWNERSHIP.md).

## 1. Create a new Google OAuth client

In Google Cloud Console, configure the OAuth consent screen and create a **Web application** OAuth client.

- Add `https://YOUR-SITE.netlify.app` under Authorized JavaScript origins.
- Add `http://localhost:8888` for Netlify local development if needed.
- Copy its client ID. A browser client ID is expected to be public; do not create or use a browser client secret.

## 2. Deploy the Apps Script backend

1. Create a **new standalone Apps Script project**—not either existing project.
2. Replace its `Code.gs` with [`apps-script/Code.gs`](../apps-script/Code.gs).
3. In Project Settings > Script properties, add `APP_GATEWAY_SHARED_SECRET` with a unique random value (at least 32 characters).
4. Deploy as Web app. It must be reachable by Netlify; select the least broad access setting that permits Netlify’s server request in your Google Workspace. The HMAC proof is mandatory regardless of the deployment access setting.
5. Copy the `/exec` deployment URL. Do not use the `/dev` URL.

## 3. Configure Netlify

In Site configuration > Environment variables set:

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from step 1 |
| `APPS_SCRIPT_URL` | Apps Script `/exec` URL |
| `APP_GATEWAY_SHARED_SECRET` | exactly the value from step 2 |
| `ALLOWED_ORIGINS` | comma-separated production origin(s), e.g. `https://YOUR-SITE.netlify.app` |

Deploy the repository. Netlify bundles Function environment variables server-side; they are not exposed to browser code.

## 4. Add the client ID safely

Set `GOOGLE_CLIENT_ID` in Netlify with **Functions** scope. The `/api/config` Function returns only this public browser client ID to the page. Do **not** put `APPS_SCRIPT_URL`, `APP_GATEWAY_SHARED_SECRET`, OAuth client secrets, or refresh tokens in browser files.

## Production test checklist

1. Sign in; confirm an unsigned browser cannot save.
2. Save one capture, task, follow-up, meal, weight, and exercise record.
3. Reload; confirm Today reflects only the signed-in account’s records.
4. Sign in with a second test account; confirm it sees none of the first account’s data.
5. In DevTools, alter an API request body’s `owner_id` if added manually; Apps Script must ignore it and use the verified subject.
6. Try the Function from an unlisted Origin; it must respond 403.
7. Confirm Drive created separate `Purpose Driven/<user-key>/Purpose Driven Journal` folders/docs.
8. Rotate the shared secret in both services together if it is ever exposed, then redeploy.

## Operational limits

Google Apps Script has quotas and web-app request limits. This app is designed for personal-scale tracking. The included docs sync is append-only; Sheets remains the structured source of truth. Voice capture relies on browser speech recognition and may not be supported by every browser.
