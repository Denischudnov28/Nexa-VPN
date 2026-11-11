import type { WireGuardProfile } from "./types";

// A WireGuard key is exactly 32 bytes encoded as canonical Base64 (44 chars)
// or the equivalent unpadded representation (43 chars).
const KEY_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=?$/;

function isKey(value: unknown): value is string {
  return typeof value === "string" &&
    (value.length === 43 || value.length === 44) &&
    KEY_PATTERN.test(value);
}

function isIPv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^(0|[1-9]\\d{0,2})$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function isIPv6(value: string): boolean {
  if (!value.includes(":") || value.includes("%")) return false;
  // Embedded IPv4 is permitted only as the final 32 bits.
  let address = value;
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    if (lastColon < 0 || !isIPv4(address.slice(lastColon + 1))) return false;
    const octets = address.slice(lastColon + 1).split(".").map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = address.slice(0, lastColon + 1) + high + ":" + low;
  }
  if ((address.match(/::/g) ?? []).length > 1) return false;
  const compressed = address.includes("::");
  const halves = address.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = compressed && halves[1] ? halves[1].split(":") : [];
  const groups = [...left, ...right];
  if (!groups.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) return false;
  return compressed ? groups.length < 8 : groups.length === 8;
}

function isIp(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

function isCidr(value: string): boolean {
  const match = value.match(/^(.+)\\/(\\d{1,3})$/);
  if (!match) return false;
  const [, ip, prefixText] = match;
  const maxPrefix = ip.includes(":") ? 128 : 32;
  const prefix = Number(prefixText);
  return prefix >= 0 && prefix <= maxPrefix && isIp(ip);
}

function isHostname(value: string): boolean {
  if (value.length > 253 || value.length === 0) return false;
  const hostname = value.endsWith(".") ? value.slice(0, -1) : value;
  return hostname.split(".").every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  );
}

function isEndpoint(value: string): boolean {
  const match = value.match(/^(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+):(\\d{1,5})$/);
  if (!match) return false;
  const host = match[1].startsWith("[") ? match[1].slice(1, -1) : match[1];
  const port = Number(match[2]);
  const validHost = match[1].startsWith("[") ? isIPv6(host) : isHostname(host);
  return validHost && port >= 1 && port <= 65535;
}

export function validateWireGuardProfile(input: unknown): input is WireGuardProfile {
  if (!input || typeof input !== "object") return false;
  const profile = input as Partial<WireGuardProfile>;
  if (typeof profile.id !== "string" || !profile.id.trim() ||
      typeof profile.name !== "string" || !profile.name.trim() ||
      !profile.interface || !Array.isArray(profile.peers)) return false;

  const iface = profile.interface;
  if (!isKey(iface.privateKey) || !Array.isArray(iface.addresses) || iface.addresses.length === 0) return false;
  if (!iface.addresses.every((address) => typeof address === "string" && isCidr(address))) return false;
  if (iface.dns !== undefined &&
      (!Array.isArray(iface.dns) || !iface.dns.every((item) => typeof item === "string" && isIp(item)))) return false;
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
  return lines.join("\\n");
}
