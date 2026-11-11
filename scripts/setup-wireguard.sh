#!/usr/bin/env bash
# NEXA VPN - single-client WireGuard bootstrap for Ubuntu 22.04/24.04.
# Run as root on a fresh Germany-based VPS. Never commit generated keys/configs.
set -Eeuo pipefail
umask 077

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root: sudo bash setup-wireguard.sh" >&2
  exit 1
fi
if ! command -v apt-get >/dev/null 2>&1; then
  echo "This bootstrap currently supports Ubuntu/Debian with apt." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y wireguard iptables curl ca-certificates

WAN_IF="$(ip -4 route list default | awk 'NR==1 {print $5}')"
if [[ -z "${WAN_IF}" ]]; then
  echo "Could not detect the public network interface." >&2
  exit 1
fi
PUBLIC_IP="$(curl -4fsS --max-time 10 https://api.ipify.org || true)"
if [[ -z "${PUBLIC_IP}" ]]; then
  echo "Could not detect public IPv4. Check outbound network access." >&2
  exit 1
fi

WG_DIR="/etc/wireguard"
install -d -m 700 "${WG_DIR}"
if [[ -e "${WG_DIR}/wg0.conf" ]]; then
  echo "Found existing /etc/wireguard/wg0.conf; refusing to overwrite it." >&2
  exit 1
fi

SERVER_PRIVATE="$(wg genkey)"
SERVER_PUBLIC="$(printf '%s' "${SERVER_PRIVATE}" | wg pubkey)"
CLIENT_PRIVATE="$(wg genkey)"
CLIENT_PUBLIC="$(printf '%s' "${CLIENT_PRIVATE}" | wg pubkey)"

cat > "${WG_DIR}/wg0.conf" <<EOF
[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = ${SERVER_PRIVATE}
SaveConfig = false
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o ${WAN_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o ${WAN_IF} -j MASQUERADE

[Peer]
# NEXA primary client
PublicKey = ${CLIENT_PUBLIC}
AllowedIPs = 10.66.66.2/32
EOF
chmod 600 "${WG_DIR}/wg0.conf"

cat > /etc/sysctl.d/99-nexa-wireguard.conf <<'EOF'
net.ipv4.ip_forward=1
EOF
sysctl --system >/dev/null

cat > /root/nexa-client.conf <<EOF
[Interface]
PrivateKey = ${CLIENT_PRIVATE}
Address = 10.66.66.2/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = ${SERVER_PUBLIC}
Endpoint = ${PUBLIC_IP}:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
chmod 600 /root/nexa-client.conf

systemctl enable --now wg-quick@wg0
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 51820/udp
fi

cat > /root/NEXA-SERVER-INFO.txt <<EOF
NEXA VPN server bootstrap completed.
Public IPv4: ${PUBLIC_IP}
WireGuard UDP port: 51820
Network interface: ${WAN_IF}
Client profile: /root/nexa-client.conf
IMPORTANT: Open UDP port 51820 in the VPS provider firewall/security group.
Transfer /root/nexa-client.conf to the NEXA client securely, then delete temporary copies.
Never send this file in chat or commit it to Git.
EOF
chmod 600 /root/NEXA-SERVER-INFO.txt

echo
echo "NEXA WireGuard server is running."
echo "Public IPv4: ${PUBLIC_IP}"
echo "Client profile: /root/nexa-client.conf"
echo "Open UDP 51820 in the provider firewall."
echo "Keep /root/nexa-client.conf private; it contains the client private key."
wg show wg0
