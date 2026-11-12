# NEXA VPN — international commercial launch plan

## Product direction

NEXA VPN is intended to be a paid consumer VPN service for customers in Russia and other countries. The service must not be marketed as production-ready until the native tunnel, gateway fleet, account backend, billing, support and security tests are operational.

## Target architecture

- **Mobile apps:** React Native client for Android and iOS. Android uses Android VpnService; iOS uses a Packet Tunnel Network Extension. The platform tunnel state, not UI state or an API response, is authoritative.
- **Identity and control plane:** account sessions, device registration, subscription entitlements, server catalog, device-specific peer provisioning, immediate revocation and audit events.
- **Gateways:** independent WireGuard gateways deployed in selected regions. Each gateway has health checks, capacity limits, firewall policy, DNS handling, IPv4/IPv6 routing, metrics and automated peer cleanup.
- **Billing:** provider adapters behind one internal billing interface. Payment methods and availability are selected by customer country and merchant eligibility. Never assume a foreign processor accepts Russian-issued cards or that an app-store billing method is available in every market.
- **Admin console:** customer/device lookup, subscription status, refunds/revocations, gateway health/capacity, incident controls and audit log.
- **Privacy:** collect only data required to operate accounts, subscriptions, fraud prevention and service reliability. Do not log browsing destinations or DNS query contents. Publish an accurate privacy policy and retention schedule; validate all claims against actual implementation.

## Market and launch sequence

### Stage 0 — engineering validation
1. Implement and test real WireGuard tunnels on physical Android and iOS devices.
2. Provision one controlled gateway and a minimal control plane.
3. Test DNS, IPv4, IPv6 and WebRTC leaks; reconnect, sleep/wake, network switching, kill-switch/fail-closed behavior and revocation.
4. Add gateway monitoring, rate limits, abuse handling, backups and incident procedures.

### Stage 1 — controlled beta
1. Invite a small group of testers in Russia and a small group in other supported countries.
2. Launch only in countries where the operator, hosting, payment providers, app stores and service model have been reviewed for local legal and sanctions compliance.
3. Measure throughput, latency, packet loss, concurrent peers, CPU, memory and monthly bandwidth. Set per-gateway admission limits from measured load rather than a guessed user count.
4. Offer manual support and refunds while billing and entitlement flows are validated.

### Stage 2 — paid public release
1. Add a billing adapter for eligible domestic payment methods and a separate adapter for international payments.
2. Implement subscription states: trial (optional), active, grace period, past due, cancelled, refunded and revoked.
3. Verify purchase server-side using signed webhooks or platform purchase verification. Never trust a client-side “payment successful” flag.
4. Add clear pricing, renewal terms, cancellation, refund policy, support contact and privacy disclosures.
5. Roll out gradually with abuse monitoring, capacity alerts and a rollback plan.

### Stage 3 — scale
1. Add gateway regions based on real demand and measured capacity, not a long country list for marketing.
2. Use per-region capacity-aware server selection and health-based failover.
3. Separate the control plane from VPN gateways; use a replicated database and durable job queue before larger scale.
4. Load-test and review security before each major expansion.

## Commercial and compliance gates

- Confirm the legal entity, operating country, tax treatment, consumer terms and privacy obligations for each target market.
- Confirm hosting-provider terms and local rules for VPN operation in every gateway jurisdiction.
- Confirm sanctions/export-control restrictions and payment-provider country/card acceptance before promising Russian or international payment support.
- Review Apple VPN app requirements, Network Extension entitlements, developer account eligibility and current App Store rules.
- Review Google Play VPN and billing policies, including the applicable billing program and regional exceptions.
- Do not claim anonymity, zero logs, unlimited speed or guaranteed availability unless independently substantiated.
- Publish a support process, abuse contact, incident response procedure and data-retention policy.

## Initial commercial model (to validate)

Use monthly, quarterly and annual subscriptions. Keep prices, currencies, device limits, renewal terms and taxes configurable by market. Avoid fixing public prices until gateway bandwidth costs, payment fees, taxes, refunds and support costs are known.

## Current repository truth

The current repository is an Expo/React Native application shell with a TypeScript WireGuard profile contract. It does not yet provide a production VPN tunnel, live backend, payment processing or deployed gateway fleet. A successful Android debug build is not evidence of an operational VPN service.

## Definition of public-launch ready

- Real, stable tunnels on supported physical Android and iOS devices.
- Verified secure key generation/storage, provisioning and revocation.
- Leak, reconnect, kill-switch and network-change tests pass.
- Control plane, billing verification and subscription entitlement tests pass.
- Gateway monitoring, capacity limits, incident response and backups are operational.
- Legal, privacy, payment, store-review and customer-support gates are complete.
- A limited beta has met agreed reliability and support targets.
