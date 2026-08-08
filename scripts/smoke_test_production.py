#!/usr/bin/env python3
"""
Production smoke-test for the Guardrail Mesh deployment.

Verifies connectivity and basic security posture of the Vercel Next.js control
plane and the Python drift-monitor service WITHOUT modifying any production
analytics or certification state.

Usage:
    PRODUCTION_BASE_URL=https://your-app.vercel.app \
    DRIFT_MONITOR_URL=https://your-drift-monitor.run.app \
    DRIFT_MONITOR_API_TOKEN=<token> \
    MESH_AUTH_TOKEN_SECRET=<32-char-secret> \
    python scripts/smoke_test_production.py

Environment variables:
    PRODUCTION_BASE_URL       Required. Vercel/production Next.js base URL.
    DRIFT_MONITOR_URL         Required. Drift-monitor service base URL.
    DRIFT_MONITOR_API_TOKEN   Required. Service-to-service bearer token.
    MESH_AUTH_TOKEN_SECRET    Required. HMAC secret for JWT generation (min 32 chars).
    MESH_AUTH_ISSUER          Optional. JWT issuer claim. Default: https://identity.example.gov
    MESH_AUTH_AUDIENCE        Optional. JWT audience claim. Default: guardrail-mesh-operator
    SMOKE_TEST_TIMEOUT        Optional. Per-request timeout seconds. Default: 15.

Output never prints secrets.
Exit 0 = all checks passed.
Exit 1 = one or more checks failed.
Exit 2 = misconfiguration; required variables are missing.
"""

from __future__ import annotations

import json
import os
import sys
import time

import requests
import jwt

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

PRODUCTION_BASE_URL = os.getenv("PRODUCTION_BASE_URL", "").strip().rstrip("/")
DRIFT_MONITOR_URL   = os.getenv("DRIFT_MONITOR_URL", "").strip().rstrip("/")
API_TOKEN           = os.getenv("DRIFT_MONITOR_API_TOKEN", "").strip()
AUTH_SECRET         = os.getenv("MESH_AUTH_TOKEN_SECRET", "").strip()
ISSUER              = os.getenv("MESH_AUTH_ISSUER", "https://identity.example.gov")
AUDIENCE            = os.getenv("MESH_AUTH_AUDIENCE", "guardrail-mesh-operator")
TIMEOUT             = float(os.getenv("SMOKE_TEST_TIMEOUT", "15"))

# --------------------------------------------------------------------------
# Pre-flight validation
# --------------------------------------------------------------------------

def _abort_missing(name: str) -> None:
    print(f"[ABORT] Missing required environment variable: {name}")
    sys.exit(2)

if not PRODUCTION_BASE_URL:
    _abort_missing("PRODUCTION_BASE_URL")
if not DRIFT_MONITOR_URL:
    _abort_missing("DRIFT_MONITOR_URL")
if not API_TOKEN:
    _abort_missing("DRIFT_MONITOR_API_TOKEN")
if not AUTH_SECRET:
    _abort_missing("MESH_AUTH_TOKEN_SECRET")
if len(AUTH_SECRET) < 32:
    print("[ABORT] MESH_AUTH_TOKEN_SECRET must be at least 32 characters.")
    sys.exit(2)

# Enforce HTTPS for production smoke tests
for label, url in [("PRODUCTION_BASE_URL", PRODUCTION_BASE_URL), ("DRIFT_MONITOR_URL", DRIFT_MONITOR_URL)]:
    if not url.startswith("https://"):
        print(f"[ABORT] {label} must use HTTPS for production smoke tests. Got: {url[:8]}...")
        sys.exit(2)

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

_PASS_COUNT = 0
_FAIL_COUNT = 0


def _pass(label: str, detail: str = "") -> None:
    global _PASS_COUNT
    _PASS_COUNT += 1
    suffix = f" — {detail}" if detail else ""
    print(f"  [PASS] {label}{suffix}")


def _fail(label: str, detail: str = "") -> None:
    global _FAIL_COUNT
    _FAIL_COUNT += 1
    suffix = f" — {detail}" if detail else ""
    print(f"  [FAIL] {label}{suffix}")


def _get(url: str, headers: dict | None = None) -> requests.Response | None:
    try:
        return requests.get(url, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        _fail(f"GET {url}", f"request error: {type(e).__name__}")
        return None


def _post(url: str, body: dict, headers: dict | None = None) -> requests.Response | None:
    try:
        return requests.post(url, json=body, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        _fail(f"POST {url}", f"request error: {type(e).__name__}")
        return None


def _make_operator_token() -> str:
    now = int(time.time())
    payload = {
        "sub": "smoke-test-operator",
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": now,
        "nbf": now - 60,
        "exp": now + 3600,
        "scope": "mesh:operator",
        "roles": ["operator"],
    }
    return jwt.encode(payload, AUTH_SECRET, algorithm="HS256")


# --------------------------------------------------------------------------
# Check 1: Vercel production root responds
# --------------------------------------------------------------------------

def check_vercel_health() -> None:
    print("\n[1] Vercel control plane health...")
    resp = _get(PRODUCTION_BASE_URL)
    if resp is None:
        return
    if resp.status_code == 200:
        _pass("Vercel root responds with HTTP 200")
    else:
        _fail("Vercel root", f"HTTP {resp.status_code}")


# --------------------------------------------------------------------------
# Check 2: drift-monitor /health responds
# --------------------------------------------------------------------------

def check_drift_monitor_health() -> None:
    print("\n[2] Drift-monitor /health...")
    resp = _get(f"{DRIFT_MONITOR_URL}/health")
    if resp is None:
        return
    if resp.status_code == 200:
        body = resp.json()
        if body.get("status") == "ok":
            _pass("/health returns {\"status\":\"ok\"}")
        else:
            _fail("/health returned unexpected body", str(body)[:80])
    else:
        _fail("/health", f"HTTP {resp.status_code}")


# --------------------------------------------------------------------------
# Check 3: protected drift endpoint rejects missing token
# --------------------------------------------------------------------------

def check_protected_rejects_missing_token() -> None:
    print("\n[3] Protected drift endpoint rejects missing token...")
    resp = _post(
        f"{DRIFT_MONITOR_URL}/api/analyze-drift",
        body={"baseline_distribution": [0.5, 0.5], "live_distribution": [0.5, 0.5]},
    )
    if resp is None:
        return
    if resp.status_code in (401, 403):
        _pass(f"Missing token correctly rejected with HTTP {resp.status_code}")
    else:
        _fail("Protected endpoint did not reject missing token", f"HTTP {resp.status_code}")


# --------------------------------------------------------------------------
# Check 4: protected drift endpoint accepts correct service token
# --------------------------------------------------------------------------

def check_protected_accepts_valid_token() -> None:
    print("\n[4] Protected drift endpoint accepts valid token...")
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    resp = _post(
        f"{DRIFT_MONITOR_URL}/api/analyze-drift",
        body={"baseline_distribution": [0.5, 0.5], "live_distribution": [0.5, 0.5]},
        headers=headers,
    )
    if resp is None:
        return
    if resp.status_code == 200:
        body = resp.json()
        if "drift_detected" in body:
            _pass("Valid token accepted, drift analysis returned expected schema")
        else:
            _fail("Valid token accepted but unexpected response body", str(body)[:80])
    else:
        _fail(f"Valid token rejected", f"HTTP {resp.status_code}")


# --------------------------------------------------------------------------
# Check 5: Vercel → drift-monitor DLP path
# --------------------------------------------------------------------------

def check_vercel_dlp_path() -> None:
    print("\n[5] Vercel → drift-monitor DLP path...")
    token = _make_operator_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    # Use the sandbox endpoint (which invokes DLP internally) with a benign prompt
    resp = _post(
        f"{PRODUCTION_BASE_URL}/api/sandbox",
        body={"prompt": "What is the capital of France?", "targetModel": "gemini-2.0-flash"},
        headers=headers,
    )
    if resp is None:
        return
    if resp.status_code == 200:
        body = resp.json()
        if "blocked" in body:
            _pass("Sandbox DLP path responded with expected schema")
        else:
            _fail("Sandbox DLP path returned unexpected body", str(body)[:80])
    elif resp.status_code == 503:
        _fail("DLP service unavailable from Vercel (drift-monitor unreachable)", "HTTP 503")
    else:
        _fail("Vercel DLP sandbox path", f"HTTP {resp.status_code}")


# --------------------------------------------------------------------------
# Check 6: authenticated operator sandbox evaluation
# --------------------------------------------------------------------------

def check_operator_sandbox_evaluation() -> None:
    print("\n[6] Authenticated operator sandbox evaluation (no persist)...")
    token = _make_operator_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    # No persist block — does NOT touch DB analytics or certifications
    resp = _post(
        f"{PRODUCTION_BASE_URL}/api/sandbox/evaluate-agent",
        body={"scenarioId": "poisoned-invoice-sql", "targetModel": "gemini-2.0-flash"},
        headers=headers,
    )
    if resp is None:
        return
    if resp.status_code == 200:
        body = resp.json()
        if "status" in body and "sovereignImpact" in body:
            si = body.get("sovereignImpact", {})
            if si.get("persistedIndex") is None:
                _pass("Sandbox evaluation completed without persistence (as expected)")
            else:
                _fail("Evaluation without persist block unexpectedly wrote a persistedIndex")
        else:
            _fail("Evaluation returned unexpected schema", str(body)[:80])
    elif resp.status_code == 503:
        _fail("Sandbox evaluation: DLP unavailable", "HTTP 503")
    else:
        _fail("Sandbox evaluation", f"HTTP {resp.status_code}")


# --------------------------------------------------------------------------
# Check 7: unauthenticated endpoints return 401
# --------------------------------------------------------------------------

def check_unauthenticated_returns_401() -> None:
    print("\n[7] Unauthenticated protected endpoints return 401...")
    endpoints = [
        "/api/generate-swarm-attack",
        "/api/sandbox",
        "/api/sandbox/evaluate-agent",
    ]
    all_ok = True
    for endpoint in endpoints:
        resp = _post(f"{PRODUCTION_BASE_URL}{endpoint}", body={"target_context": "test"})
        if resp is None:
            all_ok = False
            continue
        if resp.status_code == 401:
            _pass(f"Unauthenticated {endpoint} → 401")
        else:
            _fail(f"Unauthenticated {endpoint}", f"HTTP {resp.status_code} (expected 401)")
            all_ok = False


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print(" GUARDRAIL MESH — PRODUCTION SMOKE TEST")
    print("=" * 60)
    print(f"  Vercel:        {PRODUCTION_BASE_URL}")
    print(f"  Drift-Monitor: {DRIFT_MONITOR_URL}")
    print(f"  Timeout:       {TIMEOUT}s per request")
    print("  Secrets:       (not printed)")

    check_vercel_health()
    check_drift_monitor_health()
    check_protected_rejects_missing_token()
    check_protected_accepts_valid_token()
    check_vercel_dlp_path()
    check_operator_sandbox_evaluation()
    check_unauthenticated_returns_401()

    print("\n" + "=" * 60)
    print(f"  Results: {_PASS_COUNT} passed, {_FAIL_COUNT} failed")
    print("=" * 60)

    if _FAIL_COUNT > 0:
        sys.exit(1)
    else:
        print(" ALL CHECKS PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
