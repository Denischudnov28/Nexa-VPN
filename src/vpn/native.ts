import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type NativeVpnState =
  | "disconnected" | "connecting" | "connected" | "disconnecting"
  | "reasserting" | "up" | "down" | "error";

export type WireGuardKeyPair = { privateKey: string; publicKey: string };\ntype NativeVpnModule = {\n  getOrCreateKeyPair(): Promise<WireGuardKeyPair>;
  prepare(): Promise<boolean>;
  connect(config: string): Promise<NativeVpnState>;
  disconnect(): Promise<NativeVpnState>;
  getStatus(): Promise<NativeVpnState>;
};

const nativeModule = NativeModules.NexaVpnModule as NativeVpnModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(NativeModules.NexaVpnModule) : null;

function moduleOrThrow(): NativeVpnModule {
  if (!nativeModule) {
    throw new Error(`NEXA VPN native module is missing in this ${Platform.OS} build. Expo Go is not supported.`);
  }
  return nativeModule;
}

export const nexaNativeVpn = {\n  getOrCreateKeyPair: () => moduleOrThrow().getOrCreateKeyPair(),
  prepare: () => moduleOrThrow().prepare(),
  connect: (wgQuickConfig: string) => moduleOrThrow().connect(wgQuickConfig),
  disconnect: () => moduleOrThrow().disconnect(),
  getStatus: () => moduleOrThrow().getStatus(),
  addStatusListener: (listener: (state: NativeVpnState) => void) =>
    emitter?.addListener("NexaVpnStatus", listener) ?? { remove() {} },
};
