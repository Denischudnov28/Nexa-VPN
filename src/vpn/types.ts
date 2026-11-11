export type TunnelState =
  | "disconnected" | "connecting" | "connected" | "disconnecting" | "reasserting" | "error";

export type WireGuardPeer = {
  publicKey: string;
  endpoint: string;
  allowedIPs: string[];
  persistentKeepalive?: number;
  presharedKey?: string;
};

export type WireGuardProfile = {
  id: string;
  name: string;
  interface: { privateKey: string; addresses: string[]; dns?: string[] };
  peers: WireGuardPeer[];
};

export type TunnelSnapshot = {
  state: TunnelState;
  serverId?: string;
  connectedAt?: number;
  lastErrorCode?: string;
};

/** Implement in native code. Never log privateKey or presharedKey. */
export interface NativeWireGuardModule {
  prepare(): Promise<boolean>;
  connect(serializedConfig: string): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<TunnelSnapshot>;
  addStatusListener(listener: (snapshot: TunnelSnapshot) => void): { remove(): void };
}
