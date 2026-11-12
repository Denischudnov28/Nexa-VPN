-- Address pools and provisioning lifecycle for WireGuard gateways.
ALTER TABLE gateways ADD COLUMN IF NOT EXISTS ipv4_cidr CIDR;
ALTER TABLE gateway_peers DROP CONSTRAINT IF EXISTS gateway_peers_status_check;
ALTER TABLE gateway_peers ADD CONSTRAINT gateway_peers_status_check
  CHECK (status IN ('provisioning', 'active', 'revoking', 'revoked'));
CREATE INDEX IF NOT EXISTS gateway_peers_ip_pool_idx
  ON gateway_peers(gateway_id, assigned_ipv4)
  WHERE status IN ('provisioning', 'active', 'revoking');
