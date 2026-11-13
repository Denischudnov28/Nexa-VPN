# NEXA VPN control-plane foundation

This directory defines the first backend foundation for the international service. It is a **database model and API contract**, not a running or deployed backend.

## Data model

Apply migrations in order to PostgreSQL 16+ using a migration runner: `001_initial_schema.sql`, `002_auth_sessions.sql`, then `003_gateway_agent_queue_and_ipam.sql`. Migration 003 adds the gateway agent token digest/heartbeat, IPv4 CIDR pool, the provisioning/revocation job queue, and the `provisioning` peer state required by the control-plane worker endpoints.

The schema deliberately does not store browsing history, DNS query contents, client private keys, raw payment card data or complete WireGuard client profiles.

## Implemented API foundation

The Fastify service currently provides health status, public healthy-gateway catalog, account registration, password login, access-token authentication for the current-account endpoint, rotating opaque refresh tokens, logout, authenticated device listing/registration, account-scoped device revocation, and current subscription entitlement lookup. Device registration accepts only a WireGuard public key (32 decoded bytes); private keys must be generated and retained by the client. Accounts are limited to five non-revoked devices. Passwords are stored as PBKDF2-SHA512 hashes; refresh tokens are stored only as SHA-256 hashes. Apply migrations `001_initial_schema.sql`, `002_auth_sessions.sql`, and `003_gateway_agent_queue_and_ipam.sql` before starting the service.

Set `ACCESS_TOKEN_SECRET` to at least 32 random characters (use a cryptographically random secret, e.g. `openssl rand -base64 48`). Keep it in the hosting provider's secret manager, never in Git. `DATABASE_SSL=require` should be used for a production database connection.

**Not yet production-ready:** email verification and account recovery, gateway peer provisioning and confirmed peer revocation, subscription enforcement during tunnel provisioning, payment provider adapters, admin roles/MFA, and gateway management are not implemented. Registration currently creates an active account; restrict access to a controlled beta until email verification and abuse controls are added. Device deletion marks associated gateway peers as `revoking`; it does not yet prove the peer has been removed from a live gateway. Do not treat this as an immediate kill switch until the private gateway agent acknowledges peer removal.

## Required implementation order

1. Authentication: verified email or another supported identity flow; short-lived access tokens and rotating refresh sessions; rate limits and account recovery.
2. Device registration: client generates its WireGuard key pair locally; API receives only the public key.
3. Entitlements: check subscription status and period on the server for every provisioning request.
4. Gateway allocator: choose only healthy gateways with available capacity; reserve a unique client address transactionally.
5. Provisioning: send the public peer key to the gateway over an authenticated private management channel; return the client config only to the authenticated device over TLS.
6. Revocation: remove the peer from the gateway immediately and mark the device/peer revoked.
7. Billing adapters: accept signed, idempotent provider webhooks; verify transactions server-side; never trust client-side payment-success flags.
8. Admin operations: role-based access, MFA, audit log, support tooling and emergency gateway disable.

## Non-negotiable security requirements

- TLS for every public API; private gateway management traffic must stay on a private network or use mutually authenticated transport.
- Never send a client private key to the control plane. Never log access tokens, refresh tokens, payment payloads or WireGuard configs.
- Store passwords only with a modern password hash (Argon2id preferred); never reversible encryption.
- Store refresh-token hashes, rotate on use, detect reuse and revoke token families.
- Enforce per-account/device limits, rate limits, request validation and authorization at every endpoint.
- Verify webhook signatures and timestamps; use unique provider event IDs for idempotency.
- Use transactions/locking for IP allocation and capacity reservations.
- Keep gateway server private keys outside the database and source control.
- Add backup/restore drills, dependency scanning, secret scanning, monitoring and incident response before public launch.

## Market and compliance

Payment-provider and app-store eligibility varies by merchant country, customer country, sanctions restrictions and current provider rules. Do not promise support for Russian-issued cards or any payment method until the legal entity and provider have confirmed acceptance. Review local VPN, privacy, consumer, tax and hosting requirements before enabling a country.


## Gateway database configuration

Before a gateway can accept provisioning jobs, its row must have:
- a valid `ipv4_cidr` IPv4 pool (use a dedicated private subnet, e.g. a /24; reserve the first usable address for the gateway);
- a unique WireGuard server `public_key` and reachable `endpoint_host` / `endpoint_port`;
- a high-entropy gateway-agent token whose SHA-256 hex digest is stored in `gateways.agent_token_hash`;
- a measured `capacity_peers` value and `status = 'online'` only after the gateway agent is healthy.

Never store the plaintext agent token in PostgreSQL, Git, logs, or chat. The gateway agent must authenticate using the `X-Nexa-Agent-Token` header and must only manage its own WireGuard interface. Do not mark a gateway online until UDP reachability, the WireGuard interface, IPv4 forwarding/NAT, DNS and leak tests have passed.

Migration 003 supplies the schema expected by the current queue and allocator routes. It does not deploy a gateway agent or create a gateway record; those remain separate deployment steps.
