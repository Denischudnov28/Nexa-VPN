-- Per-gateway credentials for the private WireGuard agent API.
-- Store only SHA-256 hashes; provision hashes out-of-band, never through public API.
ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS agent_token_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS agent_last_seen_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS gateways_agent_token_hash_idx
  ON gateways(agent_token_hash)
  WHERE agent_token_hash IS NOT NULL;
