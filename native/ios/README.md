# iOS Packet Tunnel integration

The Packet Tunnel provider source is in `NexaPacketTunnelProvider.swift`.
The wg-quick parser extension is based on WireGuard Apple upstream source and retains its MIT notice.

## Required Xcode work

1. Generate the native iOS project with Expo prebuild/EAS.
2. Add a Network Extension target with bundle identifier `app.nexa.vpn.network-extension`.
3. Set the extension point to `com.apple.networkextension.packet-tunnel` and its principal class to `$(PRODUCT_MODULE_NAME).NexaPacketTunnelProvider`.
4. Add the WireGuard Apple Swift package: `https://git.zx2c4.com/wireguard-apple`.
5. Follow upstream WireGuardKit instructions to add the external `WireGuardGoBridgeiOS` build target and link `WireGuardKit` to both the app and extension. The package alone does not build the Go bridge.
6. Enable the Network Extensions capability / Packet Tunnel entitlement for the app's developer team and provision both targets.
7. Store the WireGuard profile in Keychain-backed storage in the containing app. This sample reads a wg-quick profile from the provider protocol's `WgQuickConfig` dictionary only to keep the extension sample self-contained; do not ship private keys in an ordinary plist or logs.
8. Test on physical iPhones with real server configuration and verify DNS, IPv4, IPv6, reconnect and leak behavior.

This source is not yet wired to a React Native module or Xcode target. A successful JavaScript build does not prove the iOS extension builds or that a VPN tunnel is active.
