export type VpnStatus = "disconnected" | "connecting" | "connected" | "disconnecting" | "error";

export type VpnServer = {
  id: string;
  name: string;
  countryCode: string;
  city: string;
  latencyMs?: number;
};

/**
 * Native tunnel adapter boundary.
 *
 * Production implementation must bridge to WireGuard:
 * - iOS: Network Extension / NEPacketTunnelProvider
 * - Android: VpnService
 *
 * This placeholder intentionally refuses to claim a connection until a real
 * native implementation and provisioned server configuration are installed.
 */
export const vpn = {
  async connect(_server: VpnServer): Promise<never> {
    throw new Error("VPN tunnel is not configured yet. Native WireGuard integration is required.");
  },
  async disconnect(): Promise<void> {
    // No tunnel exists in the starter build.
  },
  async getStatus(): Promise<VpnStatus> {
    return "disconnected";
  }
};
