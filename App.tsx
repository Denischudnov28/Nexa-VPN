import React, { useEffect, useState } from "react";
import {
  Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { nexaNativeVpn, type NativeVpnState } from "./src/vpn/native";

const isValidConfig = (value: string) => {
  const text = value.trim();
  if (!/^\[Interface\]/im.test(text) || !/^\[Peer\]/im.test(text)) return false;
  if (!/^PrivateKey\s*=\s*\S+/im.test(text)) return false;
  if (!/^PublicKey\s*=\s*\S+/im.test(text)) return false;
  if (!/^Endpoint\s*=\s*\S+:\d{1,5}/im.test(text)) return false;
  if (!/^AllowedIPs\s*=\s*\S+/im.test(text)) return false;
  return true;
};

const stateLabel: Record<NativeVpnState, string> = {
  disconnected: "Not connected", down: "Not connected", connecting: "Connecting…",
  connected: "Protected connection", up: "Protected connection",
  disconnecting: "Disconnecting…", reasserting: "Reconnecting…", error: "Connection error",
};

export default function App() {
  const [config, setConfig] = useState("");
  const [state, setState] = useState<NativeVpnState>("disconnected");
  const [busy, setBusy] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    let mounted = true;
    const subscription = nexaNativeVpn.addStatusListener((next) => {
      if (mounted) setState(next);
    });
    nexaNativeVpn.getStatus().then((next) => {
      if (mounted) setState(next);
    }).catch(() => {
      if (mounted) setState("disconnected");
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const connected = state === "connected" || state === "up";
  const working = busy || state === "connecting" || state === "disconnecting";

  const handleConnect = async () => {
    if (!isValidConfig(config)) {
      Alert.alert("Configuration required", "Paste a valid WireGuard configuration containing [Interface], [Peer], PrivateKey, PublicKey, Endpoint and AllowedIPs.");
      return;
    }
    setBusy(true);
    try {
      const permission = await nexaNativeVpn.prepare();
      if (!permission) {
        Alert.alert("Permission required", "Allow NEXA VPN in the system dialog, then tap Connect again.");
        return;
      }
      const result = await nexaNativeVpn.connect(config.trim());
      setState(result);
    } catch (error) {
      setState("error");
      Alert.alert("Could not connect", error instanceof Error ? error.message : "Check your WireGuard profile and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      const result = await nexaNativeVpn.disconnect();
      setState(result);
    } catch (error) {
      Alert.alert("Could not disconnect", error instanceof Error ? error.message : "The VPN tunnel could not be stopped.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ExpoStatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>N</Text></View>
          <View>
            <Text style={styles.brand}>NEXA VPN</Text>
            <Text style={styles.tagline}>Private connection. Clear control.</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={[styles.statusDot, connected && styles.statusDotOn, state === "error" && styles.statusDotError]} />
          <Text style={styles.status}>{stateLabel[state] ?? "Connection status"}</Text>
          <Text style={styles.description}>
            {connected ? "Your device is connected through the WireGuard tunnel." : "Import your WireGuard profile to create an encrypted VPN connection."}
          </Text>
          <View style={[styles.actionButton, connected ? styles.disconnectButton : styles.connectButton, working && styles.disabled]}>
            <Text
              accessibilityRole="button"
              onPress={working ? undefined : connected ? handleDisconnect : () => setShowConfig(true)}
              style={[styles.actionText, connected && styles.disconnectText]}
            >
              {working ? "Please wait…" : connected ? "Disconnect" : "Set up connection"}
            </Text>
          </View>
          {!connected && <Text style={styles.note}>NEXA only reports a protected connection after the native WireGuard tunnel confirms it.</Text>}
        </View>

        {showConfig && !connected && (
          <View style={styles.serverCard}>
            <Text style={styles.sectionTitle}>WireGuard configuration</Text>
            <Text style={styles.serverHint}>Paste the configuration supplied by your VPN server. Your private key stays in this screen's memory and is not uploaded to NEXA.</Text>
            <TextInput
              value={config}
              onChangeText={setConfig}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder={"[Interface]\nPrivateKey = …\nAddress = …\nDNS = …\n\n[Peer]\nPublicKey = …\nEndpoint = host:51820\nAllowedIPs = 0.0.0.0/0, ::/0"}
              placeholderTextColor="#60758A"
              style={styles.configInput}
              textAlignVertical="top"
              accessibilityLabel="WireGuard configuration"
            />
            <View style={styles.actionButtonPrimary}>
              <Text accessibilityRole="button" onPress={working ? undefined : handleConnect} style={styles.actionText}>Connect securely</Text>
            </View>
            <Text style={styles.cancel} onPress={() => setShowConfig(false)}>Cancel</Text>
          </View>
        )}

        <View style={styles.serverCard}>
          <Text style={styles.sectionTitle}>Connection status</Text>
          <Text style={styles.serverName}>{connected ? "WireGuard tunnel active" : "No active server"}</Text>
          <Text style={styles.serverHint}>A working connection requires a valid WireGuard profile and an online VPN server. NEXA does not include a VPN server subscription.</Text>
        </View>
        <Text style={styles.footer}>NEXA VPN · Client 0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07111F" },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 42 },
  logo: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#57D6C5", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#07111F", fontSize: 30, fontWeight: "900" },
  brand: { color: "#FFFFFF", fontSize: 23, fontWeight: "800", letterSpacing: 1.2 },
  tagline: { color: "#8FA3B8", fontSize: 12, marginTop: 3 },
  statusCard: { backgroundColor: "#101F31", borderRadius: 26, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#1D344B" },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#8191A4", marginBottom: 12 },
  statusDotOn: { backgroundColor: "#57D6C5" },
  statusDotError: { backgroundColor: "#F07878" },
  status: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", textAlign: "center" },
  description: { color: "#91A4B8", textAlign: "center", lineHeight: 21, marginTop: 10, marginBottom: 24 },
  actionButton: { width: "100%", borderRadius: 18, paddingVertical: 17, alignItems: "center" },
  connectButton: { backgroundColor: "#57D6C5" },
  disconnectButton: { backgroundColor: "#26394D" },
  actionButtonPrimary: { borderRadius: 16, paddingVertical: 16, backgroundColor: "#57D6C5", alignItems: "center", marginTop: 14 },
  disabled: { opacity: 0.55 },
  actionText: { color: "#07111F", fontSize: 16, fontWeight: "800", textAlign: "center" },
  disconnectText: { color: "#FFFFFF" },
  note: { color: "#71869B", textAlign: "center", fontSize: 11, lineHeight: 17, marginTop: 18 },
  serverCard: { marginTop: 22, backgroundColor: "#101F31", borderRadius: 22, padding: 22, borderWidth: 1, borderColor: "#1D344B" },
  sectionTitle: { color: "#8FA3B8", fontSize: 13, fontWeight: "600", marginBottom: 12 },
  serverName: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  serverHint: { color: "#91A4B8", fontSize: 12, lineHeight: 19, marginTop: 7 },
  configInput: { minHeight: 220, marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: "#29435D", backgroundColor: "#091727", color: "#EAF2FA", padding: 14, fontSize: 12, lineHeight: 18, fontFamily: "monospace" },
  cancel: { color: "#8FA3B8", textAlign: "center", marginTop: 16, padding: 8 },
  footer: { color: "#50657A", textAlign: "center", marginTop: "auto", paddingTop: 28, fontSize: 11 },
});
