# NEXA VPN architecture

## Current repository state

The repository contains a React Native / Expo application shell and a TypeScript contract for the future native tunnel. **It does not establish a VPN connection yet.** The UI must continue to say so until native tunnel status confirms a live connection.

## Target architecture

1. **Mobile client**
   - React Native UI and account/session layer.
   - WireGuard profile validation before handing a profile to native code.
   - Native tunnel state is the single source of truth for Connected/Disconnected.
   - Secrets stored only in platform secure storage; never in AsyncStorage, analytics, logs or crash reports.
2. **Native tunnel**
   - iOS: Network Extension app extension using WireGuardKit / WireGuard Apple tunnel provider.
   - Android: Android VpnService using the official WireGuard Android tunnel implementation.
   - Platform permission/consent flow, foreground notification on Android, lifecycle recovery and explicit disconnect.
3. **Control plane**
   - Authenticates users and devices.
   - Issues short-lived device-specific WireGuard configurations.
   - Tracks server health/capacity and revokes device access.
   - Does not receive or store a client's interface private key.
4. **VPN gateways**
   - WireGuard servers with firewall policy, DNS resolver, IPv4/IPv6 routing, monitoring and capacity limits.

## Connection lifecycle

disconnected -> connecting -> connected -> disconnecting -> disconnected

Any native error transitions to error; recovery must be explicit and observable. Do not infer connected from a successful API response or a button press.

## Release gates

- Native tunnel integration on physical iOS and Android devices.
- iOS Network Extension entitlement and provisioning profile configured.
- Android VpnService consent and foreground-service behavior verified.
- IPv4, IPv6, DNS and WebRTC leak tests pass.
- Kill-switch / fail-closed behavior tested on network changes.
- Reconnect, sleep/wake, airplane mode and server failure tested.
- Security review of key generation, storage, provisioning and revocation.
- Privacy policy, support contact and store review materials prepared.
