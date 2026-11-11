# NEXA VPN — Germany WireGuard server

This repository contains a bootstrap script for a **single WireGuard server and one initial client profile**. It does not provision a VPS account or purchase infrastructure.

## Required infrastructure

- A fresh Ubuntu 22.04/24.04 VPS in Germany with a public IPv4 address.
- At least 1 vCPU and 1 GB RAM is sufficient for a small personal test deployment.
- Provider firewall/security group must allow **UDP 51820 inbound**.
- SSH access with a sudo-capable account.

## Provisioning

1. Create a VPS in a German data centre with Ubuntu 24.04.
2. Add an inbound firewall rule: UDP, port 51820, source 0.0.0.0/0. Restrict SSH (TCP 22) to your own IP.
3. Connect over SSH and run:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/Denischudnov28/Nexa-VPN.git
cd Nexa-VPN
sudo bash scripts/setup-wireguard.sh
```

The script installs WireGuard, enables IPv4 forwarding, configures NAT, starts `wg0`, and creates:

- `/root/nexa-client.conf` — initial client profile (contains a private key)
- `/root/NEXA-SERVER-INFO.txt` — server details

Both files are mode 0600. **Do not commit, paste into chat, or publish the client profile.** Transfer it to your phone only over a secure channel, then delete temporary copies. The client profile is a credential: anyone holding it can use this VPN peer.

## Verification

```bash
sudo systemctl status wg-quick@wg0
sudo wg show
sudo ss -lunp | grep 51820
```

After the phone imports the profile and connects, `sudo wg show` should display a recent handshake and transfer counters.

## Current limitations / production checklist

- This is a single-server bootstrap, not a multi-region control plane or subscription service.
- The current Android native integration still needs a successful APK build and device testing.
- iOS requires a correctly signed Network Extension target, provisioning profile, App Group/Keychain handoff, and device testing. The repository's iOS README documents the manual Xcode integration; this bootstrap does not make an iOS build production-ready.
- The initial profile routes IPv4 and IPv6 into the tunnel. This server bootstrap provides IPv4 NAT only; IPv6 traffic is intentionally not routed out of the VPS. Validate DNS, IPv4/IPv6 leak behaviour, kill-switch behaviour, reconnects, and provider firewall rules before relying on it.
- No user credentials, payment data, private keys, or server secrets belong in GitHub Actions variables or source control.
- The VPS provider, account, billing, and actual server creation are user-controlled and are not performed by this script.

## Security

Use a unique profile per device in production, support revocation/rotation, and move key delivery to a reviewed authenticated provisioning flow before offering accounts to other users.
