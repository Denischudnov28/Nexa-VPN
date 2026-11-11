# Native WireGuard implementation

This project uses a native-module boundary because Expo Go cannot provide a production VPN tunnel. Build with an Expo development build / EAS or a native project after the platform modules are integrated.

## iOS

- Add a Packet Tunnel Network Extension target.
- Integrate the maintained WireGuard Apple / WireGuardKit implementation.
- Configure the Network Extensions entitlement and App Group only if required by the selected implementation.
- Implement a native module that conforms to NativeWireGuardModule.
- Persist tunnel configuration using the platform VPN configuration APIs; keep private keys out of JavaScript persistence.
- Configure signing, provisioning and the Network Extension capability in the Apple Developer account.
- Test on a physical device. Simulator testing is not sufficient for final VPN validation.

## Android

- Integrate the maintained WireGuard Android tunnel library or a reviewed VpnService implementation.
- Declare and implement VpnService with the required foreground-service notification and user consent flow.
- Implement lifecycle handling for process death, network changes and revoke().
- Store private key material using Android Keystore-backed protection where supported.
- Test always-on / lockdown behavior only where the platform and product policy support it.

## Shared bridge contract

The JavaScript contract lives in src/vpn/types.ts. Native code must implement:
- prepare(): request platform authorization and report whether setup is permitted.
- connect(serializedConfig): validate again natively, install the tunnel and resolve only when the platform accepted the start request.
- disconnect(): stop the tunnel and clean up resources.
- getStatus(): return actual OS tunnel state.
- addStatusListener(): emit lifecycle changes.

The native layer must reject malformed profiles, avoid logging configuration strings, and never report Connected until the OS tunnel reports an active state.

## Important

No signing certificates, Apple Developer membership, Android signing key, VPN gateway, server private keys or production WireGuard profiles are included in this repository. Those are required to build and operate a real service.
