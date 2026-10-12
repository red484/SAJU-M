-- Keep the order tombstone after account deletion so it cannot be granted again.
CREATE TABLE toss_coach_orders (
  order_id text PRIMARY KEY,
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  sku text NOT NULL,
  purchased_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 50),
  refunded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX toss_coach_orders_user_idx ON toss_coach_orders(user_id);
