import type { WireGuardProfile } from "./types";

const KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=?$/;

function isKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value) && value.length >= 43;
}

function isCidr(value: string): boolean {
  const [ip, prefix, extra] = value.split("/");
  if (!ip || prefix === undefined || extra !== undefined) return false;
  const bits = Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false;
  return ip.includes(":") || ip.split(".").length === 4;
}

function isEndpoint(value: string): boolean {
  const match = value.match(/^(?:\[[0-9A-Fa-f:]+\]|[A-Za-z0-9.-]+):(\d{1,5})$/);
  if (!match) return false;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535;
}

export function validateWireGuardProfile(input: unknown): input is WireGuardProfile {
  if (!input || typeof input !== "object") return false;
  const profile = input as Partial<WireGuardProfile>;
  if (!profile.id || !profile.name || !profile.interface || !Array.isArray(profile.peers)) return false;
  const iface = profile.interface;
  if (!isKey(iface.privateKey) || !Array.isArray(iface.addresses) || iface.addresses.length === 0) return false;
  if (!iface.addresses.every((address) => typeof address === "string" && isCidr(address))) return false;
  if (iface.dns && (!Array.isArray(iface.dns) || !iface.dns.every((item) => typeof item === "string" && item.length > 0))) return false;
  if (profile.peers.length === 0) return false;
  return profile.peers.every((peer) =>
    isKey(peer.publicKey) &&
    typeof peer.endpoint === "string" && isEndpoint(peer.endpoint) &&
    Array.isArray(peer.allowedIPs) && peer.allowedIPs.length > 0 &&
    peer.allowedIPs.every((cidr) => typeof cidr === "string" && isCidr(cidr)) &&
    (peer.persistentKeepalive === undefined ||
      (Number.isInteger(peer.persistentKeepalive) && peer.persistentKeepalive >= 0 && peer.persistentKeepalive <= 65535)) &&
    (peer.presharedKey === undefined || isKey(peer.presharedKey))
  );
}

/** Produces a WireGuard INI string. Call only after validation. */
export function serializeWireGuardProfile(profile: WireGuardProfile): string {
  const lines = [
    "[Interface]",
    `PrivateKey = ${profile.interface.privateKey}`,
    ...profile.interface.addresses.map((value) => `Address = ${value}`),
    ...(profile.interface.dns?.length ? [`DNS = ${profile.interface.dns.join(", ")}`] : []),
  ];
  for (const peer of profile.peers) {
    lines.push("", "[Peer]", `PublicKey = ${peer.publicKey}`);
    if (peer.presharedKey) lines.push(`PresharedKey = ${peer.presharedKey}`);
    lines.push(`Endpoint = ${peer.endpoint}`, `AllowedIPs = ${peer.allowedIPs.join(", ")}`);
    if (peer.persistentKeepalive !== undefined) lines.push(`PersistentKeepalive = ${peer.persistentKeepalive}`);
  }
  return lines.join("\n");
}
