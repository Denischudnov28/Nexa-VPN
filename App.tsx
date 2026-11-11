import React from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

export default function App() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ExpoStatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>N</Text></View>
          <View>
            <Text style={styles.brand}>NEXA VPN</Text>
            <Text style={styles.tagline}>Private connection. Clear control.</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <Text style={styles.status}>Not connected</Text>
          <Text style={styles.description}>Your internet connection is not protected by NEXA VPN.</Text>
          <View style={styles.connectButton}>
            <Text style={styles.connectText}>VPN not configured</Text>
          </View>
          <Text style={styles.note}>A secure tunnel will be available after native WireGuard integration and server setup.</Text>
        </View>

        <View style={styles.serverCard}>
          <Text style={styles.sectionTitle}>Server location</Text>
          <Text style={styles.serverName}>No servers available</Text>
          <Text style={styles.serverHint}>Server locations will appear here after the control server is connected.</Text>
        </View>
        <Text style={styles.footer}>NEXA VPN · Client preview 0.1.0</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07111F" },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 36 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 48 },
  logo: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#57D6C5", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#07111F", fontSize: 30, fontWeight: "900" },
  brand: { color: "#FFFFFF", fontSize: 23, fontWeight: "800", letterSpacing: 1.2 },
  tagline: { color: "#8FA3B8", fontSize: 12, marginTop: 3 },
  statusCard: { backgroundColor: "#101F31", borderRadius: 26, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#1D344B" },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#8191A4", marginBottom: 12 },
  status: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  description: { color: "#91A4B8", textAlign: "center", lineHeight: 21, marginTop: 10, marginBottom: 24 },
  connectButton: { width: "100%", borderRadius: 18, paddingVertical: 17, backgroundColor: "#26394D", alignItems: "center" },
  connectText: { color: "#B7C6D5", fontSize: 16, fontWeight: "700" },
  note: { color: "#71869B", textAlign: "center", fontSize: 11, lineHeight: 17, marginTop: 18 },
  serverCard: { marginTop: 22, backgroundColor: "#101F31", borderRadius: 22, padding: 22, borderWidth: 1, borderColor: "#1D344B" },
  sectionTitle: { color: "#8FA3B8", fontSize: 13, fontWeight: "600", marginBottom: 12 },
  serverName: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  serverHint: { color: "#71869B", fontSize: 12, lineHeight: 18, marginTop: 7 },
  footer: { color: "#50657A", textAlign: "center", marginTop: "auto", marginBottom: 18, fontSize: 11 }
});
