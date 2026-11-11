# NEXA VPN control-plane API (proposed)

This is an implementation contract, not a live backend.

All endpoints require HTTPS. Access tokens must be short-lived and refreshable. Device identity must be revocable. Never return server private keys.

## Endpoints

- POST /v1/auth/session — authenticate and create a session.
- POST /v1/devices — register a device public key and platform metadata.
- GET /v1/servers — list available gateways and health metadata.
- POST /v1/devices/{deviceId}/wireguard-profile — provision a device-specific client profile.
- DELETE /v1/devices/{deviceId} — revoke device access and remove its peer from gateways.
- GET /v1/me/subscription — return entitlement and expiry metadata.

## Provisioning rules

1. Generate the WireGuard interface key pair on the device when feasible.
2. Send only the public key to the control plane.
3. The control plane allocates an address and installs the public peer key on a gateway.
4. Return the client private key only if generated server-side as a documented fallback; prefer device-side generation.
5. Do not log request/response bodies containing credentials or profiles.
6. Support immediate peer revocation and configuration rotation.

## Server response shape

    {
      "id": "gateway-id",
      "name": "Singapore 01",
      "countryCode": "SG",
      "city": "Singapore",
      "endpoint": "vpn.example.net:51820",
      "publicKey": "BASE64_WIREGUARD_PUBLIC_KEY",
      "allowedIPs": ["0.0.0.0/0", "::/0"],
      "dns": ["1.1.1.1"]
    }

Replace example hostnames and keys only with infrastructure that the operator controls. Do not ship these sample values as a production profile.
