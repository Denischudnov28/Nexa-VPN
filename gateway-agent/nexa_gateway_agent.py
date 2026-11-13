#!/usr/bin/env python3
"""NEXA VPN gateway agent. Uses only Python stdlib and the local wg CLI."""
from __future__ import annotations

import base64
import ipaddress
import json
import logging
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import Any

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s nexa-gateway-agent: %(message)s",
)
log = logging.getLogger("nexa-gateway-agent")
STOP = False


def stop_handler(_signum: int, _frame: Any) -> None:
    global STOP
    STOP = True


signal.signal(signal.SIGTERM, stop_handler)
signal.signal(signal.SIGINT, stop_handler)

API_URL = os.environ.get("NEXA_API_URL", "").rstrip("/")
GATEWAY_ID = os.environ.get("NEXA_GATEWAY_ID", "")
AGENT_TOKEN = os.environ.get("NEXA_AGENT_TOKEN", "")
WG_INTERFACE = os.environ.get("WG_INTERFACE", "wg0")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "3"))
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "15"))


def validate_config() -> None:
    if not API_URL.startswith("https://"):
        raise SystemExit("NEXA_API_URL must use HTTPS")
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", GATEWAY_ID):
        raise SystemExit("NEXA_GATEWAY_ID must be a UUID")
    if len(AGENT_TOKEN) < 32 or len(AGENT_TOKEN) > 256:
        raise SystemExit("NEXA_AGENT_TOKEN must contain 32..256 characters")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,15}", WG_INTERFACE):
        raise SystemExit("Invalid WG_INTERFACE")
    if POLL_SECONDS < 1 or POLL_SECONDS > 60:
        raise SystemExit("POLL_SECONDS must be between 1 and 60")


def api_request(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        API_URL + path,
        data=data,
        method="GET" if payload is None else "POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Nexa-Agent-Token": AGENT_TOKEN,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        # Do not log response bodies or request headers; they may contain secrets.
        raise RuntimeError(f"control-plane HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"control-plane request failed: {type(exc).__name__}") from None


def validate_public_key(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", value):
        raise ValueError("invalid WireGuard public key format")
    try:
        decoded = base64.b64decode(value, validate=True)
    except ValueError:
        raise ValueError("invalid WireGuard public key encoding") from None
    if len(decoded) != 32 or base64.b64encode(decoded).decode("ascii") != value:
        raise ValueError("invalid WireGuard public key length")
    return value


def run_wg(*args: str) -> str:
    result = subprocess.run(
        ["wg", *args],
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if result.returncode != 0:
        # wg stderr is intentionally not forwarded to logs.
        raise RuntimeError(f"wg command failed (exit {result.returncode})")
    return result.stdout


def save_interface_config() -> None:
    # Persist runtime peer changes so a gateway reboot cannot resurrect stale peers.
    result = subprocess.run(
        ["wg-quick", "save", WG_INTERFACE],
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError(f"wg-quick save failed (exit {result.returncode})")


def current_peer_allowed_ips(public_key: str) -> str | None:
    output = run_wg("show", WG_INTERFACE, "allowed-ips")
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0] == public_key:
            return ",".join(parts[1:])
    return None


def apply_job(job: dict[str, Any]) -> None:
    action = job.get("action")
    public_key = validate_public_key(job.get("public_key"))
    if action == "provision_peer":
        address = str(ipaddress.IPv4Address(job.get("assigned_ipv4", "")))
        run_wg("set", WG_INTERFACE, "peer", public_key, "allowed-ips", address + "/32")
        try:
            save_interface_config()
        except RuntimeError:
            # Do not leave a runtime-only peer behind if persistent config could not be saved.
            try:
                run_wg("set", WG_INTERFACE, "peer", public_key, "remove")
            except RuntimeError:
                log.critical("Could not roll back a peer after config persistence failed")
            raise
        log.info("Provisioned peer for device %s", job.get("device_id", "unknown"))
    elif action == "revoke_peer":
        previous_allowed_ips = current_peer_allowed_ips(public_key)
        if previous_allowed_ips is not None:
            run_wg("set", WG_INTERFACE, "peer", public_key, "remove")
            try:
                save_interface_config()
            except RuntimeError:
                # Restore runtime state to match the unchanged persistent config.
                try:
                    run_wg("set", WG_INTERFACE, "peer", public_key, "allowed-ips", previous_allowed_ips)
                except RuntimeError:
                    log.critical("Could not restore a peer after config persistence failed")
                raise
        log.info("Revoked peer for device %s", job.get("device_id", "unknown"))
    else:
        raise ValueError("unsupported gateway job action")


def process_one_job() -> bool:
    response = api_request(
        "/v1/gateway-agent/jobs/claim",
        {"gatewayId": GATEWAY_ID},
    )
    job = response.get("job")
    if not job:
        return False
    job_id = job.get("id")
    if not isinstance(job_id, str) or not re.fullmatch(
        r"[0-9a-fA-F-]{36}", job_id
    ):
        log.error("Received malformed job identifier")
        return True

    success = False
    try:
        apply_job(job)
        success = True
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        log.error("Gateway job %s failed: %s", job_id, str(exc))
    api_request(
        f"/v1/gateway-agent/jobs/{job_id}/complete",
        {"gatewayId": GATEWAY_ID, "success": success},
    )
    return True


def main() -> int:
    validate_config()
    run_wg("show", WG_INTERFACE)
    log.info("Agent started for gateway %s on interface %s", GATEWAY_ID, WG_INTERFACE)
    while not STOP:
        try:
            found = process_one_job()
            if not found:
                time.sleep(POLL_SECONDS)
        except RuntimeError as exc:
            log.warning("%s", str(exc))
            time.sleep(min(POLL_SECONDS * 2, 30))
    log.info("Agent stopped")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        log.error("Fatal agent error: %s", type(exc).__name__)
        sys.exit(1)
