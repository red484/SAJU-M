CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anonymous_sessions (
  id text PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS saju_journals (
  session_id text PRIMARY KEY REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_sessions (
  id uuid PRIMARY KEY,
  anonymous_session_id text REFERENCES anonymous_sessions(id) ON DELETE SET NULL,
  feature text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS llm_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usage_session_id uuid REFERENCES usage_sessions(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  key_label text,
  status text NOT NULL,
  finish_reason text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anonymous_session_id text REFERENCES anonymous_sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  resource_type text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_sessions_anonymous_session ON usage_sessions(anonymous_session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_requests_usage_session ON llm_requests(usage_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_created ON audit_logs(anonymous_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created ON audit_logs(event_type, created_at DESC);
