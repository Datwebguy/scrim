-- AI apps (Claude, ChatGPT, Cursor and others) that a person connects to their own Scrim account.
-- An app registers itself, the person approves it on /app/connect, and the app gets its own session.
CREATE TABLE oauth_clients (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  redirect_uris jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- A one-time code from an approval, swapped for the app's session within five minutes.
CREATE TABLE oauth_codes (
  code_hash      bytea PRIMARY KEY,
  client_id      text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  session_id     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);

-- A session that belongs to a connected AI app, not to a browser. Browsers never accept it.
ALTER TABLE sessions ADD COLUMN client_id text REFERENCES oauth_clients(id) ON DELETE CASCADE;
CREATE INDEX sessions_connectors ON sessions (account_id) WHERE client_id IS NOT NULL;
