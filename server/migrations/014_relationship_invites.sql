-- Holds nicknames and element counts only. Birth data never reaches this table.
CREATE TABLE relationship_invites (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  owner_summary jsonb NOT NULL,
  guest_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX relationship_invites_owner_idx ON relationship_invites(owner_id);
CREATE INDEX relationship_invites_expiry_idx ON relationship_invites(expires_at);
