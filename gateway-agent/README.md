# NEXA VPN Gateway Agent

Minimal Linux agent for the private control-plane channel. It currently handles **device revocation only**.

## Security model
- One random credential per gateway; the API stores only its SHA-256 hash.
- Agent credentials are sent only over HTTPS in `X-Nexa-Agent-Token`.
- The agent receives a device's WireGuard public key, never its private key.
- The agent runs as root because it must modify the WireGuard interface. Keep the host dedicated, patched, and firewall-restricted.
- Do not expose the agent API or WireGuard management socket publicly.

## Build
Requires Go 1.22+ and the WireGuard `wg` utility.

```sh
go test ./...
go build -trimpath -ldflags="-s -w" -o nexa-gateway-agent .
```

## Configure
Create a gateway credential from a cryptographically secure random value (at least 32 bytes). Insert its lowercase SHA-256 hex digest into `gateways.agent_token_hash` using a secure administrative database session. Never store the raw credential in the database or source control.

Install `nexa-gateway-agent` at `/usr/local/bin/nexa-gateway-agent`, copy `nexa-gateway-agent.env.example` to `/etc/nexa-gateway-agent.env`, set the real API URL, gateway UUID and raw token, then install the systemd unit from `nexa-gateway-agent.service`.

```sh
chmod 600 /etc/nexa-gateway-agent.env
systemctl daemon-reload
systemctl enable --now nexa-gateway-agent
journalctl -u nexa-gateway-agent -f
```

## Current limitations
- The agent polls only `revoke_peer` jobs and removes the peer from the live WireGuard interface.
- Provisioning jobs are intentionally not claimed yet. Address allocation, persistent peer configuration, profile retrieval, agent heartbeat monitoring and end-to-end tests must be completed before selling subscriptions.
- The current revocation path removes the live peer. Persistent configuration reconciliation after reboot is a follow-up requirement; use a managed peer include/configuration rather than relying on runtime state for production.
- Run only against a real gateway after the control plane and database migrations are deployed and the gateway credential is provisioned.
