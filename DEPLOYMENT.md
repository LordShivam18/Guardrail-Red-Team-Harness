# Guardrail & Red-Team Harness — Deployment Guide

This document outlines the deployment topology, required environment variables, service configuration, and security requirements for production and CI environments.

---

## 1. System Topology

The Guardrail & Red-Team Harness architecture comprises two primary services:

```
                  ┌─────────────────────────────────────────┐
                  │              Clients / UI               │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │    Next.js Control Plane Application    │
                  │              (Vercel / Node)            │
                  └────────┬──────────────────────┬─────────┘
                           │                      │
       Internal HTTPS (token-authenticated)       │ PostgreSQL (Neon / SCIF)
                           │                      │ Redis (Rate Limiting)
                           ▼                      ▼
    ┌───────────────────────────────┐   ┌───────────────────┐
    │  Python Drift-Monitor Service │   │  State Services   │
    │     (FastAPI / Cloud Run)     │   │ (PostgreSQL/Redis)│
    └───────────────────────────────┘   └───────────────────┘
```

1. **Next.js Web Application & API Gateway**: Deployed to Vercel (or Node.js container). Exposes user dashboards, active interception proxy (`/api/proxy/v1/chat/completions`), and sandbox evaluation endpoints.
2. **Drift-Monitor & DLP Scrubber Service**: Deployed separately as a Python FastAPI container (e.g. Google Cloud Run, AWS ECS, Railway, or Docker Compose). Provides statistical KL-divergence analysis, Presidio DLP redaction, and multi-agent swarm attack payload generation.

---

## 2. Drift-Monitor Service — Production Deployment Checklist

### Build

| Setting | Value |
|---------|-------|
| **Build context** | `services/drift-monitor/` |
| **Dockerfile** | `services/drift-monitor/Dockerfile` |
| **Base image** | `python:3.12-slim` |
| **Model** | `en_core_web_lg==3.8.0` (pinned wheel, installed at build time, never at runtime) |

```bash
# Build the image
docker build -t guardrail-drift-monitor:latest ./services/drift-monitor

# Verify the spaCy model is baked in (should print "spaCy model ok")
docker run --rm guardrail-drift-monitor:latest python -c \
  "import spacy; spacy.load('en_core_web_lg'); print('spaCy model ok')"
```

### Runtime Port

The container listens on `${PORT:-8000}`. Managed platforms (Cloud Run, Railway, ECS) inject `PORT` automatically. Docker Compose deployments default to `8000`.

| Setting | Value |
|---------|-------|
| **Exposed port** | `8000` (or `$PORT` if set by the platform) |
| **Bind address** | `0.0.0.0` |
| **Health path** | `GET /health` (unauthenticated, returns `{"status":"ok"}`) |

### Security properties

- Runs as non-root user `guardrail` (UID 10001)
- Does NOT download models or install packages at runtime
- Read-only filesystem compatible (`/tmp` tmpfs mount for scratch)
- No new privileges (`security_opt: no-new-privileges:true`)

### Required environment variables (drift-monitor)

| Variable | Required | Description |
|----------|----------|-------------|
| `DRIFT_MONITOR_API_TOKEN` | **Yes** | Service-to-service bearer token. Every protected endpoint validates this. Protected endpoints return `503` if absent, `401` if token is missing from request, `403` if token is wrong. |
| `DRIFT_WEBHOOK_URL` | **Yes** | Full HTTPS URL of the Next.js drift webhook endpoint (e.g. `https://app.example.com/api/webhooks/drift`). |
| `DRIFT_WEBHOOK_SECRET` | **Yes** | HMAC-SHA256 secret used to sign outgoing webhook payloads. Must match `DRIFT_WEBHOOK_SECRET` configured on the Vercel side. |
| `SWARM_PROVIDER_BASE_URL` | Production only | OpenAI-compatible API base URL (e.g. `https://api.openai.com/v1`). Required only if live swarm generation is enabled. |
| `SWARM_PROVIDER_API_KEY` | Production only | API key for the swarm LLM provider. |
| `SWARM_PROVIDER_MODEL` | Production only | Model name (e.g. `gpt-4o-mini`). |
| `PORT` | Platform-injected | Listening port. Defaults to `8000`. Set automatically by Cloud Run, Railway, ECS, etc. |

> **Note**: If `DRIFT_MONITOR_API_TOKEN`, `DRIFT_WEBHOOK_URL`, or `DRIFT_WEBHOOK_SECRET` are absent at startup, the service logs a structured warning and continues running. `/health` always remains accessible. Protected API endpoints return `503` until the token is configured.

### Token generation

Generate a cryptographically secure random token before deploying:

```bash
# Linux / macOS
python3 -c "import secrets; print(secrets.token_hex(32))"

# or
openssl rand -hex 32
```

**Never commit the generated value to source control.** Set it as a secret in your hosting platform and as a Vercel environment variable.

---

## 3. Next.js Control Plane (Vercel) — Environment Variables

Set these in the Vercel dashboard under **Project → Settings → Environment Variables**.

> **Important**: After changing any environment variable in Vercel, you must **trigger a new deployment** for the change to take effect.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (`postgresql://...?sslmode=require`) |
| `REDIS_URL` | **Yes** | Redis connection URL (`redis://...`) for proxy rate-limiting |
| `GEMINI_API_KEY` | **Yes** | Production Google Gemini API key |
| `MESH_AUTH_TOKEN_SECRET` | **Yes** | HMAC signing secret for JWT operator tokens (≥32 chars). Generate with `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `MESH_AUTH_ISSUER` | **Yes** | Trusted JWT token issuer (e.g. `https://identity.example.gov`) |
| `MESH_AUTH_AUDIENCE` | **Yes** | Target JWT audience (e.g. `guardrail-mesh-operator`) |
| `DRIFT_MONITOR_URL` | **Yes** | **HTTPS** URL of the deployed drift-monitor service (e.g. `https://drift.example.run.app`). HTTP is rejected in production. |
| `DRIFT_MONITOR_API_TOKEN` | **Yes** | Service-to-service bearer token. Must match the value set on the drift-monitor container. |
| `DRIFT_WEBHOOK_SECRET` | **Yes** | Secret for verifying incoming HMAC-signed webhook alerts from the drift-monitor. Must match `DRIFT_WEBHOOK_SECRET` on the drift-monitor. |
| `DEPLOYMENT_TARGET` | Recommended | Set to `vercel` (or leave unset; Vercel sets `VERCEL=1` automatically). Controls HTTPS enforcement in URL validation. |

---

## 4. GitHub Secrets (Scheduled Nightly Workflow Only)

The scheduled live red-team workflow (`.github/workflows/nightly-redteam.yml`) evaluates real external model providers against the live production database. It requires the following repository secrets:

- `DATABASE_URL`: Production PostgreSQL database connection string.
- `GEMINI_API_KEY`: Production Gemini API key.

*Note: Standard `push` and `pull_request` workflows do **not** require these secrets; they execute completely deterministically using isolated local containers and test adapters.*

---

## 5. Security & Network Isolation Requirements

1. **Service-to-Service Authentication**: The FastAPI drift-monitor service enforces `DRIFT_MONITOR_API_TOKEN` bearer token authentication on all endpoints except `/health`. Requests with a missing token return `401`. Requests with an incorrect token return `403`. Requests where the token is not configured server-side return `503`.
2. **Network Protocol Security**: In production deployments (`VERCEL=1` or `NODE_ENV=production`), `DRIFT_MONITOR_URL` must use `https://`. HTTP URLs are permitted only within isolated Docker Compose networks (`DEPLOYMENT_TARGET=docker`) or CI containers (`CI=true`).
3. **Internal Error Sanitization**: Upstream LLM provider credentials, internal service endpoints, and exception stack traces must never be exposed to clients in API error responses.
4. **CI mode isolation**: CI/GITHUB_ACTIONS mode activates deterministic swarm payloads and relaxes URL validation. These modes are triggered only when `CI=true` or `GITHUB_ACTIONS=true` (exact case-sensitive string match). They cannot be accidentally activated in production unless those variables are explicitly set.

---

## 6. Production Smoke Test

After deployment, run the smoke test to verify all integration paths:

```bash
PRODUCTION_BASE_URL=https://your-app.vercel.app \
DRIFT_MONITOR_URL=https://your-drift-monitor.run.app \
DRIFT_MONITOR_API_TOKEN=<token> \
MESH_AUTH_TOKEN_SECRET=<32-char-secret> \
python scripts/smoke_test_production.py
```

The script:
- Requires HTTPS for both URLs (exits with code 2 on HTTP)
- Never prints secrets
- Does not write to production analytics or certification state
- Does not invoke paid AI providers during default checks
- Exits 0 on full pass, 1 on partial failure, 2 on misconfiguration

---

## 7. Safest Deployment Sequence

1. **Build and push** the drift-monitor container image:
   ```bash
   docker build -t your-registry/guardrail-drift-monitor:latest ./services/drift-monitor
   docker push your-registry/guardrail-drift-monitor:latest
   ```

2. **Deploy drift-monitor** to your chosen platform (Cloud Run, Railway, ECS). Set all required env vars from §2 above. Note the HTTPS service URL.

3. **Set Vercel env vars** (§3 above) — especially `DRIFT_MONITOR_URL` (the URL from step 2), `DRIFT_MONITOR_API_TOKEN`, and `DRIFT_WEBHOOK_SECRET`.

4. **Trigger a new Vercel deployment** from the dashboard or via `vercel --prod`.

5. **Run the smoke test** (§6 above) to confirm end-to-end connectivity.
