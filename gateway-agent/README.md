# NEXA VPN gateway agent

The Linux gateway agent applies peer add/remove jobs from the NEXA control plane to a local WireGuard interface. It uses only Python's standard library and the `wg` CLI.

## Security model

- The agent polls only the configured control-plane HTTPS API.
- The agent token is supplied through a root-readable environment file and is never logged.
- Public keys and IPv4 addresses are validated before invoking `wg`.
- Commands use argument arrays (never a shell).
- The control plane stores only the SHA-256 digest of the agent token.
- Run one agent identity per gateway. Do not share tokens across gateways.

## Install on an Ubuntu WireGuard gateway

1. Confirm the gateway's `wg0` interface is configured and running.
2. Create a dedicated high-entropy token locally, for example:
   ```bash
   openssl rand -hex 32
   ```
3. Create `/etc/nexa-gateway-agent.env` as root with mode 0600:
   ```ini
   NEXA_API_URL=https://YOUR_CONTROL_PLANE_HOST
   NEXA_GATEWAY_ID=YOUR_GATEWAY_UUID
   NEXA_AGENT_TOKEN=YOUR_RANDOM_TOKEN
   WG_INTERFACE=wg0
   POLL_SECONDS=3
   ```
4. Store only the token's SHA-256 hex digest in `gateways.agent_token_hash`. Never put the plaintext token in the database or Git.
5. Install the files:
   ```bash
   sudo install -d -m 0755 /opt/nexa-gateway-agent
   sudo install -m 0755 nexa_gateway_agent.py /opt/nexa-gateway-agent/
   sudo install -m 0644 nexa-gateway-agent.service /etc/systemd/system/
   sudo chown root:root /etc/nexa-gateway-agent.env
   sudo chmod 0600 /etc/nexa-gateway-agent.env
   sudo systemctl daemon-reload
   sudo systemctl enable --now nexa-gateway-agent
   sudo journalctl -u nexa-gateway-agent -f
   ```

## Job behavior

- `provision_peer`: installs the device public key with its assigned IPv4 /32 AllowedIPs.
- `revoke_peer`: removes the public key from the local WireGuard interface; an already-absent peer is treated as successfully revoked.
- The agent reports success only after the local `wg` command succeeds and `wg-quick save` persists the peer change to the gateway config, so a reboot does not silently restore an old peer list.

## Important limitations

- This initial worker is a controlled-beta foundation, not a hardened production agent. It does not yet implement signed job payloads, mTLS, automatic token rotation, lease renewal, exponential backoff per job, or independent reconciliation of database state against `wg show`.
- A failed job is reported as failed for operator investigation; the agent does not silently retry a partially applied operation.
- The control-plane job lease is 60 seconds. Keep each local operation comfortably below that limit.
- Do not mark the gateway online until firewall, UDP reachability, IPv4 forwarding/NAT, DNS, IPv6 leak policy, monitoring and external leak tests are verified.
