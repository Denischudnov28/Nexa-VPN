-- Durable queue for private WireGuard gateway-agent operations.
-- Gateway agents will claim jobs over a separately authenticated private channel.
CREATE TABLE IF NOT EXISTS gateway_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  gateway_id UUID NOT NULL REFERENCES gateways(id),
  action TEXT NOT NULL CHECK (action IN ('provision_peer', 'revoke_peer')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'leased', 'succeeded', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gateway_jobs_dispatch_idx
  ON gateway_jobs(status, available_at, created_at)
  WHERE status IN ('queued', 'leased');
CREATE INDEX IF NOT EXISTS gateway_jobs_gateway_idx
  ON gateway_jobs(gateway_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS gateway_jobs_one_active_action_idx
  ON gateway_jobs(device_id, gateway_id, action)
  WHERE status IN ('queued', 'leased');
