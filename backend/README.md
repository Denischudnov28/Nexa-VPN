# NEXA VPN control-plane foundation

This directory defines the first backend foundation for the international service. It is a **database model and API contract**, not a running or deployed backend.

## Data model

Apply `migrations/001_initial_schema.sql` to PostgreSQL 16+ using a migration runner. It models accounts, devices, gateway inventory, subscription entitlements, gateway peer allocation, idempotent payment webhooks and administrative audit events.

The schema deliberately does not store browsing history, DNS query contents, client private keys, raw payment card data or complete WireGuard client profiles.

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
