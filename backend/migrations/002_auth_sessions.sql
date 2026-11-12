-- Authentication and rotating refresh-token sessions.
-- Apply after 001_initial_schema.sql.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES auth_sessions(id)
);
CREATE INDEX IF NOT EXISTS auth_sessions_account_active_idx
  ON auth_sessions(account_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions(family_id);
