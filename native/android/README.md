# Android WireGuard integration

The native controller is `NexaWireGuardController.kt` and uses the official embeddable WireGuard tunnel library.

## Integration

1. Generate the Android project using Expo prebuild/EAS.
2. Copy the controller into package path `app.nexa.vpn`.
3. Add the dependency and Java 17 desugaring settings from `wireguard-dependencies.gradle`.
4. Merge `vpn-service-manifest.xml` into the application manifest.
5. From a foreground Activity, call `authorizationIntent()` and launch the returned Intent. Wait for the user's consent result before calling `connect()`.
6. Call connect/disconnect on a background executor. Keep the profile in Android Keystore-backed storage; do not log it.
7. Implement the React Native / Expo module bridge and expose state events before connecting this controller to the UI.

The adapter uses the official GoBackend userspace implementation and only reports UP when the library returns UP. It has not yet been built in this repository's Android Gradle project or tested on a physical device. No server profile is included.
