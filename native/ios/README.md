# iOS Packet Tunnel integration

The iOS implementation consists of:
- `NexaVpnModule.swift` and `NexaVpnModuleBridge.m`: React Native bridge.
- `NexaPacketTunnelProvider.swift`: Network Extension packet-tunnel provider.
- `TunnelConfiguration+WgQuickConfig.swift`: wg-quick parser support.

## Required Xcode work

1. Generate the native iOS project with Expo prebuild/EAS.
2. Add a Network Extension target with bundle identifier `app.nexa.vpn.network-extension`.
3. Set the extension point to `com.apple.networkextension.packet-tunnel` and principal class to `$(PRODUCT_MODULE_NAME).NexaPacketTunnelProvider`.
4. Add `NexaVpnModule.swift` and `NexaVpnModuleBridge.m` to the containing app target; add `NexaPacketTunnelProvider.swift` and the required WireGuard parser sources to the extension target.
5. Add the WireGuard Apple Swift package: `https://git.zx2c4.com/wireguard-apple`.
6. Follow upstream WireGuard Apple instructions to add the external `WireGuardGoBridgeiOS` build target and link `WireGuardKit` to the extension. Adding the Swift package alone does not build the Go bridge.
7. Enable the Network Extensions capability / Packet Tunnel entitlement for the app and extension, configure signing and provisioning for both targets, and verify the provider bundle identifier matches the bridge.
8. Build and test on a physical iPhone with a real server configuration. Verify DNS, IPv4, IPv6, reconnect, sleep/wake, and leak behavior.

## Critical security requirement

The current bridge passes the complete wg-quick profile through `NETunnelProviderProtocol.providerConfiguration`. This is a development-only handoff and may persist private key material in VPN preferences. **Do not ship this implementation as production-ready.** Before production, replace this handoff with a reviewed, access-controlled Keychain/shared App Group design; minimize secret lifetime, never log configuration/private keys, and verify the actual storage and backup behavior.

## Current status

The bridge/provider sources are present but are not yet wired into generated Xcode app and extension targets. No iOS build, signing validation, or physical-device test has been completed. No production server profile is included.

A successful JavaScript build does not prove the iOS extension builds or that a VPN tunnel is active.
