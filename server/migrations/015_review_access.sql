-- Review access is a time-limited operational grant, not a purchase record.
CREATE TABLE review_access_grants (
  user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  daily_limit integer NOT NULL CHECK (daily_limit BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
