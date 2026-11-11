# Android WireGuard integration

The native implementation consists of:
- `NexaWireGuardController.kt`: official WireGuard GoBackend adapter.
- `NexaVpnModule.kt`: React Native module exposing `prepare`, `connect`, `disconnect`, `getStatus`, and `NexaVpnStatus` events.
- `NexaVpnPackage`: package that must be registered in the Android application.

## Required integration

1. Generate the native Android project with Expo prebuild/EAS.
2. Copy both Kotlin files into `android/app/src/main/java/app/nexa/vpn/` (the package declaration is `app.nexa.vpn`).
3. Add the dependency and Java 17 desugaring settings from `wireguard-dependencies.gradle` to the app Gradle file. Confirm the artifact version resolves in the configured repositories before shipping.
4. Merge `vpn-service-manifest.xml` into `android/app/src/main/AndroidManifest.xml`.
5. Register `NexaVpnPackage()` in the React Native package list in `MainApplication.kt` (or the equivalent generated application class). Without this step, `NativeModules.NexaVpnModule` will be undefined.
6. Call `prepare()` from the app, wait for the Android system consent dialog to return `true`, then call `connect(wgQuickConfig)`. Do not call connect before consent.
7. Call connect/disconnect off the UI thread. Keep private keys in Android Keystore-backed storage; do not log or persist profile strings in plaintext.
8. Build a release APK/AAB and test on physical Android devices, including permission denial, reconnect, background operation, DNS, IPv4/IPv6 routing, and leak behavior.

## Current status and limitations

The Kotlin sources and dependency/manifest snippets are present, but this repository does not yet contain a generated Android Gradle project or an automated Expo config plugin. Package registration and file/dependency integration are manual. No Android build or physical-device test has been completed. No server profile is included.

A successful TypeScript check does not prove the Android app compiles or that a VPN tunnel is active.
