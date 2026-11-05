-- Keep the row after account deletion so renewal notifications stay idempotent.
CREATE TABLE store_subscriptions (
  subscription_key text PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('apple', 'google')),
  product_id text NOT NULL,
  purchase_token text,
  period_start timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  period_used integer NOT NULL DEFAULT 0 CHECK (period_used >= 0),
  total_used integer NOT NULL DEFAULT 0 CHECK (total_used >= 0),
  day_key date,
  day_used integer NOT NULL DEFAULT 0 CHECK (day_used >= 0),
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_subscriptions_user_idx ON store_subscriptions(user_id);
