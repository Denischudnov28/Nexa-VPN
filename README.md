# NEXA VPN

Cross-platform VPN client starter for iOS and Android, built with Expo, React Native and TypeScript.

> **Current status:** this repository contains the application shell and a clearly marked VPN integration boundary. It does not yet create an encrypted VPN tunnel. A real tunnel requires native iOS Network Extension and Android VpnService implementations plus a VPN server/control plane.

## Development

```bash
npm install
npx expo start
```

## Planned implementation

- Native WireGuard tunnel integration (iOS Network Extension / Android VpnService)
- Secure configuration provisioning and device registration
- Server selection, connection state, reconnect and kill-switch behavior
- DNS and IPv4/IPv6 leak testing
- Account and subscription backend

Never commit private keys, WireGuard configs, access tokens, or production credentials.


## Architecture and integration notes

- [System architecture](docs/architecture.md)
- [Native WireGuard requirements](docs/native-wireguard.md)
- [Control-plane API contract](docs/control-plane-api.md)

The TypeScript profile validator and serializer are in `src/vpn/validation.ts`; shared native bridge types are in `src/vpn/types.ts`. A CI workflow runs the TypeScript check on pushes and pull requests.

## Security status

The current build is a client scaffold, not a production VPN. Native tunnel code, server infrastructure, secure provisioning, platform signing and leak testing remain required before any connection can be advertised as protected.
