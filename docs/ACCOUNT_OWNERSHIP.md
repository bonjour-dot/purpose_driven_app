# Account ownership and data location

Developer-controlled Google Cloud and Apps Script resources for Purpose Driven should be owned by `ryan@espoirvivant.com`. Do not use `ryan@betheltoulouse.org` as the app's backup destination.

Each person signs in with Google, receives a separate Netlify Database workspace keyed by Google's verified `sub`, and authorizes Drive independently. Netlify stores that person's encrypted refresh token. The Apps Script gateway receives a short-lived, signed proof and a user access token, then calls the Drive REST API for that user. It has no developer-owned Sheet or Docs storage path.

Drive snapshots live in that account's hidden `appDataFolder`, accessible only with this OAuth client and permission. Disconnect does not delete them. Legacy files in a developer-owned Sheet or a different OAuth client's app data folder are not implicitly migrated. Inventory them read-only and perform an explicit, reviewed migration before replacing a live deployment.

The Netlify Database remains available when Drive is disconnected or temporarily unavailable. If the database itself is unavailable, the app shows an error and does not pretend changes were saved.
