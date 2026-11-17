# Google and Netlify setup for review

This branch is a review proposal. Do not merge or deploy it until the OAuth configuration and account tests below are complete. Existing production data has not been changed.

## 1. Google Cloud

Use a Google Cloud project controlled by `ryan@espoirvivant.com`, not the work-domain account. Enable the **Google Drive API**. Configure the OAuth consent screen for the intended audience and request `openid`, `email`, and `https://www.googleapis.com/auth/drive.appdata`. Create a **Web application** OAuth client.

For the production site, register:

- Authorized JavaScript origin: `https://purposedrivenapp.netlify.app`
- Authorized redirect URI: `https://purposedrivenapp.netlify.app/api/drive`

For local tests, also register `http://localhost:8888` and `http://localhost:8888/api/drive` if that is the Netlify CLI port. Redirect URI must exactly match `GOOGLE_OAUTH_REDIRECT_URI` for the environment. Add test users while the consent screen remains in Testing. Google may require OAuth verification before public use.

For a deploy preview test, register that preview's exact origin and `/api/drive` redirect URI too, and add the preview origin to that context's `ALLOWED_ORIGINS`. Google does not accept a wildcard redirect for every preview URL.

Sign-in uses a Google ID token; Drive authorization is a separate consent step. The `drive.appdata` scope stores app-managed snapshots in a hidden folder in each user's Drive. It cannot read other Drive files or old developer-owned Sheets.

## 2. Netlify

The site needs Netlify Database, the committed migration, and these Function environment variables:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID, exposed by `/api/config` |
| `GOOGLE_CLIENT_SECRET` | Server-side OAuth code exchange |
| `GOOGLE_OAUTH_REDIRECT_URI` | Exact authorized callback URI |
| `APP_SESSION_SECRET` | Long random session signing secret |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 encoded, for AES-256-GCM |
| `ALLOWED_ORIGINS` | Comma-separated allowed site origins |
| `APPS_SCRIPT_URL` | New Apps Script `/exec` URL |
| `APP_GATEWAY_SHARED_SECRET` | Same long random value as Apps Script property |

`NETLIFY_DB_URL` is provided by Netlify Database; do not paste it into the repository. Keep all secrets in Function-scoped environment variables. Do not rotate `TOKEN_ENCRYPTION_KEY` without first re-encrypting saved refresh tokens. Preview Database branches may inherit production user data, so keep preview links private and test with non-sensitive accounts.

## 3. Apps Script

Create a **new standalone Apps Script project** under `ryan@espoirvivant.com`. Replace `Code.gs` with [`apps-script/Code.gs`](../apps-script/Code.gs). Add Script property `APP_GATEWAY_SHARED_SECRET`. Deploy a new Web app version and copy the `/exec` URL to Netlify. It must be callable by Netlify's server; the signed, five-minute gateway proof is required for every request. The script calls Drive REST with the signed-in user's OAuth access token and never uses `DriveApp`, `SpreadsheetApp`, or `DocumentApp` under the deployment owner.

Do not repoint an existing Focused or Aligned Apps Script deployment. Disconnecting Drive revokes the stored refresh token and deletes the connection row; it does not delete any Drive snapshot.

## 4. Verify before merge

1. Sign in, refresh the page, and confirm the same account stays signed in without a login loop. Sign out and switch to a second account.
2. Create capture, task, person, review, food, weight and exercise records. Reload, then check them on a second device.
3. Connect Drive, sync, disconnect and reconnect. Check the account email and timestamp. Test denied consent and expired authorization.
4. Test one new and one existing workspace, dashboard presets, drag and button reorder, widget sizes, hidden widgets, goals, habits, pins, dark mode and a narrow mobile viewport.
5. Sign in to a second Google account and verify that neither workspace nor Drive connection crosses accounts.
6. Test an older snapshot and a same-revision divergent snapshot. Restore only after reviewing the prompt and confirm the previous workspace remains in revision history.

No authenticated Google Drive or production deployment has been tested in this branch. The original Apps Script was deliberately disabled, and no `Purpose Driven Backend` Sheet was found in the connected work-domain Drive. Any legacy data in another Google account or older deployment requires a separate read-only inventory and migration plan before cutover.
