# NEXA VPN

Cross-platform VPN client starter for iOS and Android, built with Expo, React Native and TypeScript.

> **Current status:** the repository contains a React Native client shell, Android WireGuard bridge sources, iOS Packet Tunnel source files, and a Germany single-gateway bootstrap script. This is **not yet a production VPN service**: iOS targets/signing and secure key handoff are unfinished, no account/control-plane backend is deployed, no subscription billing is integrated, and no production gateway fleet is operated.

## Development

```bash
npm install
npx expo start
```

## Repository map

- `src/vpn/` — shared tunnel types, native bridge and WireGuard profile validation.
- `native/android/` and `plugins/withNexaAndroid.js` — Android WireGuard adapter and Expo config plugin.
- `native/ios/` — Packet Tunnel provider and React Native bridge source; manual Xcode target/signing work remains.
- `scripts/setup-wireguard.sh` — bootstrap for one Germany-based WireGuard gateway and one initial client profile. Not a multi-user control plane.
- `docs/` — architecture, platform integration, gateway setup and commercial launch planning.
- `backend/` — initial control-plane data model and API design (not deployed).

## Important security notes

- Never commit private keys, WireGuard client profiles, access tokens, payment credentials or production secrets.
- Do not store WireGuard private keys in AsyncStorage, logs, analytics or crash reports.
- The iOS bridge currently passes a wg-quick profile through VPN preferences for development; this may persist private-key material and must be replaced with a reviewed Keychain/App Group handoff before production.
- The single-server bootstrap creates one client peer only. It is not suitable for selling accounts or managing a public multi-user service.
- A successful TypeScript check or Android debug build does not prove a real tunnel works. Physical-device, routing, DNS, IPv4/IPv6 leak, reconnect and kill-switch tests are required.

## Target production architecture

1. Native WireGuard tunnel on supported physical Android and iOS devices.
2. Authenticated control plane for accounts, device registration, server catalog, short-lived provisioning and peer revocation.
3. Multiple independently monitored WireGuard gateways with capacity-aware allocation.
4. Server-verified subscriptions and payment-provider adapters by customer market.
5. Admin/support tools, privacy controls, audit trails and incident response.

See [international commercial launch plan](docs/international-commercial-launch-plan.md), [system architecture](docs/architecture.md), [native WireGuard requirements](docs/native-wireguard.md), and [Germany gateway setup](docs/GERMANY-WIREGUARD-SERVER.md).
