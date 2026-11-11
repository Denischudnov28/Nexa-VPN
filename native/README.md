# Native integration status

NEXA VPN currently contains preliminary native WireGuard source for Android and iOS plus a JavaScript React Native bridge.

## What exists
- Android GoBackend controller, React Native module, and package class.
- iOS Packet Tunnel provider, React Native bridge, and wg-quick parser.
- TypeScript native-module adapter.
- Integration notes for both platforms.

## What is not complete
- The Expo-generated Android/iOS projects and native targets are not present in this repository.
- Android package registration, manifest/dependency integration, and release build are not automated.
- iOS app/Packet Tunnel target wiring, entitlements, signing, and WireGuardGoBridge build integration are not complete.
- The iOS bridge currently hands the profile through VPN provider preferences; this is not approved for production secret storage.
- There is no control-plane service, user/account system, provisioned WireGuard gateway, or production peer configuration.
- No physical-device, DNS, IPv4/IPv6, kill-switch, reconnect, or traffic-leak tests have been completed.

## Release gate

Do not label the app as a working or secure VPN until both native platforms build, server provisioning is operational, secret storage has passed review, and device-level routing/leak tests pass. Never commit private keys, preshared keys, tokens, or production profiles.
