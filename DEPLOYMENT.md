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

## 2. Environment Variables Specification

### Next.js Control Plane (Vercel / Application Host)

| Variable | Type | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | String | **Yes** | PostgreSQL connection URL (`postgresql://...`) |
| `REDIS_URL` | String | **Yes** | Redis connection URL (`redis://...`) for proxy rate-limiting |
| `GEMINI_API_KEY` | Secret | **Yes** | Production Google Gemini API key |
| `MESH_AUTH_TOKEN_SECRET` | Secret | **Yes** | HMAC signing secret for JWT operator tokens (≥32 chars) |
| `MESH_AUTH_ISSUER` | String | **Yes** | Trusted JWT token issuer (e.g., `https://identity.example.gov`) |
| `MESH_AUTH_AUDIENCE` | String | **Yes** | Target JWT audience (e.g., `guardrail-mesh-operator`) |
| `DRIFT_MONITOR_URL` | URL | **Yes** | External **HTTPS** URL of the deployed drift-monitor service. `http://` allowed only under Docker/CI. |
| `DRIFT_MONITOR_API_TOKEN` | Secret | **Yes** | Service-to-service bearer token for drift-monitor authentication |
| `DRIFT_WEBHOOK_SECRET` | Secret | Optional | Secret key used to sign incoming HMAC webhook alerts from drift monitor |
| `DEPLOYMENT_TARGET` | String | Recommended | Set to `vercel`, `docker`, or `production` to enforce target-specific URL validation |

### Python Drift Monitor Service (FastAPI Host)

| Variable | Type | Required | Description |
|---|---|---|---|
| `DRIFT_MONITOR_API_TOKEN` | Secret | **Yes** | Service-to-service bearer token for API authentication (matches Next.js) |
| `DRIFT_WEBHOOK_URL` | URL | Recommended | Next.js webhook endpoint URL (`https://app.domain.com/api/webhooks/drift`) |
| `DRIFT_WEBHOOK_SECRET` | Secret | Recommended | Secret key for signing outgoing webhook payloads with HMAC-SHA256 |
| `SWARM_PROVIDER_BASE_URL` | URL | Production | OpenAI-compatible API base URL (e.g., `https://api.openai.com/v1`) |
| `SWARM_PROVIDER_API_KEY` | Secret | Production | API key for the swarm LLM provider |
| `SWARM_PROVIDER_MODEL` | String | Production | Target model name for swarm generation (e.g., `gpt-4o-mini`) |

---

## 3. GitHub Secrets (Scheduled Nightly Workflow Only)

The scheduled live red-team workflow (`.github/workflows/nightly-redteam.yml`) evaluates real external model providers against the live production database. It requires the following repository secrets:

- `DATABASE_URL`: Production PostgreSQL database connection string.
- `GEMINI_API_KEY`: Production Gemini API key.

*Note: Standard `push` and `pull_request` workflows do **not** require these secrets; they execute completely deterministically using isolated local containers and test adapters.*

---

## 4. Security & Network Isolation Requirements

1. **Service-to-Service Authentication**: The FastAPI drift-monitor service must enforce token authentication via `DRIFT_MONITOR_API_TOKEN` on all endpoints except `/health`.
2. **Network Protocol Security**: In production deployments (`VERCEL=1` or `NODE_ENV=production`), `DRIFT_MONITOR_URL` must use `https://`. HTTP URLs are permitted only within isolated internal Docker Compose networks (`DEPLOYMENT_TARGET=docker`) or CI containers (`CI=true`).
3. **Internal Error Sanitization**: Upstream LLM provider credentials, internal service endpoints, and exception stack traces must never be exposed to clients in API error responses.
