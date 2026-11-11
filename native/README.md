# NEXA VPN native integration

This folder contains native source adapters, not a ready-to-install binary.

## Android
- `android/NexaWireGuardController.kt` wraps the official WireGuard GoBackend.
- `android/NexaVpnModule.kt` exposes permission, connect, disconnect and status to React Native.
- Add `NexaVpnPackage` to the generated React Native package list (or register it using the app's package registration mechanism).
- Merge `android/vpn-service-manifest.xml` and apply `android/wireguard-dependencies.gradle` to the generated app module.
- Verify package names, Android SDK compatibility and the exact WireGuard AAR version during Gradle build.

## iOS
- `ios/NexaPacketTunnelProvider.swift` is the Network Extension provider.
- `ios/NexaVpnModule.swift` and `ios/NexaVpnModuleBridge.m` expose the app-side bridge.
- Create a separate Packet Tunnel extension target with bundle ID `app.nexa.vpn.network-extension`, add the provider source and WireGuardKit/Go bridge dependencies, and enable the Network Extension entitlement for the correct team.
- Add the app-side bridge files to the main app target.

## JavaScript
Use `src/vpn/native.ts` from a native build. Expo Go cannot load these custom modules.

## Release blockers
No Expo config plugin / generated native projects / signing assets / gateway credentials are included yet. Source code has not been compiled by Xcode or Gradle or tested on physical devices. Do not describe this as a working VPN until those steps and IPv4/IPv6/DNS leak tests pass.
