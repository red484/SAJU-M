ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE saju_journals ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app_users(id) ON DELETE CASCADE;
UPDATE saju_journals j SET user_id = s.user_id
FROM anonymous_sessions s WHERE s.id = j.session_id AND j.user_id IS NULL AND s.user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_saju_journals_user ON saju_journals(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expires ON auth_sessions(user_id, expires_at);

