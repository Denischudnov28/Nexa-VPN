# Android WireGuard integration

NEXA includes a local Expo config plugin at `plugins/withNexaAndroid.js`.

## What the plugin automates

During Expo prebuild it:
- copies `NexaWireGuardController.kt` and `NexaVpnModule.kt` into the Android app's `app.nexa.vpn` package;
- adds the WireGuard tunnel AAR dependency;
- enables Java 17 library desugaring and adds the desugaring dependency.

The dependency version `1.0.20260102` is published on Maven Central. The upstream WireGuard Android project documents the embeddable tunnel library and desugaring requirement.

## React Native package registration

The Expo config plugin also updates the generated `MainApplication.kt` to import and register `NexaVpnPackage()` in `PackageList(this).packages.apply { ... }`. It intentionally fails prebuild if the generated Kotlin structure is not recognized, rather than silently producing an app without the native module. Review the generated diff after every Expo SDK upgrade.

## Build and verify

1. Run `npm install`.
2. Run `npx expo prebuild --platform android`.
3. Verify the generated Gradle file contains the WireGuard and desugaring dependencies.
4. Verify both Kotlin files exist under `android/app/src/main/java/app/nexa/vpn/`.
5. Register `NexaVpnPackage()` as described above.
6. Build with `cd android && ./gradlew assembleDebug`.
7. Test on a physical device, including system VPN consent, denial, connect/disconnect, background operation, DNS, IPv4/IPv6 routing, reconnect, and leak behavior.

The WireGuard AAR supplies its own VPN service manifest declaration; do not duplicate it manually unless the resolved artifact's merged manifest proves it is missing.

## Status

The plugin automates source copying, Gradle dependency setup, and React Native package registration. The repository does not yet contain a generated Android Gradle project, and no Android build or physical-device test has been completed. No server profile is included.

Never log or persist the WireGuard profile in plaintext. Do not claim the tunnel protects traffic until a real provisioned server and device-level leak tests are verified.
