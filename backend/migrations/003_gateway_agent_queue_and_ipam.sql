-- NEXA VPN gateway agent queue and IPv4 peer allocation.
-- Apply after 001_initial_schema.sql and 002_auth_sessions.sql.
-- Gateway agent tokens are stored only as SHA-256 hex digests.

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS agent_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS agent_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ipv4_cidr CIDR;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'gateways'::regclass
       AND conname = 'gateways_agent_token_hash_format_check'
  ) THEN
    ALTER TABLE gateways
      ADD CONSTRAINT gateways_agent_token_hash_format_check
      CHECK (agent_token_hash IS NULL OR agent_token_hash ~ '^[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'gateways'::regclass
       AND conname = 'gateways_ipv4_cidr_check'
  ) THEN
    ALTER TABLE gateways
      ADD CONSTRAINT gateways_ipv4_cidr_check
      CHECK (
        ipv4_cidr IS NULL OR
        (family(ipv4_cidr) = 4 AND masklen(ipv4_cidr) BETWEEN 1 AND 30)
      );
  END IF;
END $$;

-- A peer must be represented while the gateway agent is installing it.
ALTER TABLE gateway_peers
  DROP CONSTRAINT IF EXISTS gateway_peers_status_check;
ALTER TABLE gateway_peers
  ADD CONSTRAINT gateway_peers_status_check
  CHECK (status IN ('provisioning', 'active', 'revoking', 'revoked'));

CREATE TABLE IF NOT EXISTS gateway_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  gateway_id UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('provision_peer', 'revoke_peer')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'succeeded', 'failed')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner UUID,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (status = 'leased' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'leased' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS gateway_jobs_claim_idx
  ON gateway_jobs(gateway_id, status, available_at, created_at);
CREATE INDEX IF NOT EXISTS gateway_jobs_device_action_idx
  ON gateway_jobs(device_id, action, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gateway_jobs_one_open_action_idx
  ON gateway_jobs(device_id, gateway_id, action)
  WHERE status IN ('queued', 'leased');

-- Released addresses must become reusable after the gateway agent confirms revocation.
ALTER TABLE gateway_peers
  DROP CONSTRAINT IF EXISTS gateway_peers_gateway_id_assigned_ipv4_key;
CREATE UNIQUE INDEX IF NOT EXISTS gateway_peers_gateway_active_ipv4_uq
  ON gateway_peers(gateway_id, assigned_ipv4)
  WHERE status IN ('provisioning', 'active', 'revoking');

CREATE INDEX IF NOT EXISTS gateway_peers_ipam_idx
  ON gateway_peers(gateway_id, assigned_ipv4)
  WHERE status IN ('provisioning', 'active', 'revoking');

CREATE INDEX IF NOT EXISTS gateways_online_capacity_idx
  ON gateways(status, country_code, active_peers, capacity_peers);

