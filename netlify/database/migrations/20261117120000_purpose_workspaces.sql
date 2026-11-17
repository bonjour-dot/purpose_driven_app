CREATE TABLE IF NOT EXISTS purpose_workspaces (
  owner_sub text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision bigint NOT NULL DEFAULT 0,
  last_sync_at timestamptz,
  sync_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS purpose_workspace_history (
  owner_sub text NOT NULL,
  revision bigint NOT NULL,
  data jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_sub, revision)
);
CREATE TABLE IF NOT EXISTS purpose_drive_connections (
  owner_sub text PRIMARY KEY,
  email text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);
