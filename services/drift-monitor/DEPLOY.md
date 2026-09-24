# Drift-monitor production deployment (Cloud Run-compatible)

Reproducible deployment for `services/drift-monitor` without touching
application behavior. Same image, same `Dockerfile`, same endpoints and auth
contract as Docker Compose and CI. For the full contract (variables, auth
matrix, HTTPS rules) see `DEPLOYMENT.md` §2–§3.

Target: any Cloud Run-compatible container host (Google Cloud Run, AWS ECS,
Railway). Manifest: `services/drift-monitor/cloud-run.yaml`.

## 1. Build the image

```bash
# From the repository root:
docker build -t guardrail-drift-monitor:latest ./services/drift-monitor

# Verify the spaCy model is baked in (should print "spaCy model ok"):
docker run --rm guardrail-drift-monitor:latest python -c \
  "import spacy; spacy.load('en_core_web_lg'); print('spaCy model ok')"
```

Release images are published by `.github/workflows/production-release.yml`
(Stage B) to:

```text
ghcr.io/<github-owner>/guardrail-red-team-harness-drift-monitor:<sha|main>
```

Build properties (from `services/drift-monitor/Dockerfile`): `python:3.12-slim`,
non-root user `guardrail` (UID 10001), no runtime downloads, listens on
`0.0.0.0:${PORT:-8000}`.

## 2. Configure secrets (values never committed)

Create three secrets in your platform's secret manager (Secret Manager secret
ids must match the `secretKeyRef.name` entries in `cloud-run.yaml`):

| Secret / variable | Purpose |
|---|---|
| `DRIFT_MONITOR_API_TOKEN` | Bearer token for all protected endpoints. Generate with `python3 -c "import secrets; print(secrets.token_hex(32))"`. The **same value** must be set as Vercel `DRIFT_MONITOR_API_TOKEN`. |
| `DRIFT_WEBHOOK_SECRET` | HMAC-SHA256 secret signing drift webhooks (`x-mesh-signature`). The **same value** must be set as Vercel `DRIFT_WEBHOOK_SECRET`. |
| `SWARM_PROVIDER_API_KEY` | Only if enabling live swarm (see below). |

```bash
# Example (Google Cloud — names only, values stay local):
printf '%s' "$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
  | gcloud secrets create DRIFT_MONITOR_API_TOKEN --data-file=- --project=<GCP-PROJECT>
printf '%s' "<paste-hmac-secret>" \
  | gcloud secrets create DRIFT_WEBHOOK_SECRET --data-file=- --project=<GCP-PROJECT>
```

## 3. Fill the manifest placeholders

In `services/drift-monitor/cloud-run.yaml` replace (nothing else):

- `<GCP-PROJECT>`, `<REGION>`
- `<GITHUB-OWNER>` and `<TAG>` (use the GHCR tag from the release summary)
- `<VERCEL-APP-HOST>` inside `DRIFT_WEBHOOK_URL`
  (must be `https://<host>/api/webhooks/drift`; HTTP is rejected by the
  Next.js validator in production)

Optional: uncomment the `SWARM_PROVIDER_*` block to enable live swarm
generation (all three or none; absent → `/api/generate-swarm-attack` 503,
everything else unaffected).

## 4. Deploy

```bash
gcloud run services replace services/drift-monitor/cloud-run.yaml \
  --project=<GCP-PROJECT> --region=<REGION>
```

Grant the runtime service account read access to the two secrets
(`roles/secretmanager.secretAccessor` on `DRIFT_MONITOR_API_TOKEN` and
`DRIFT_WEBHOOK_SECRET`), then set the Vercel side
(`DRIFT_MONITOR_URL=https://<service-url>`, matching
`DRIFT_MONITOR_API_TOKEN`, matching `DRIFT_WEBHOOK_SECRET`) and redeploy
Vercel — env changes require a new deployment.

## 5. Health verification

```bash
SERVICE_URL="https://<deployed-service-host>"

# 1. Unauthenticated liveness (must be 200 {"status":"ok"}):
curl -sf "https://$SERVICE_URL/health"

# 2. Protected endpoint without token (must be 503, fail-closed):
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://$SERVICE_URL/api/dlp-scrubber" \
  -H "Content-Type: application/json" -d '{"text":"hello"}'
# expect: 503 when the server-side token is unset, 401 when set but no bearer sent

# 3. Protected endpoint with token (must be 200):
curl -sf -X POST "https://$SERVICE_URL/api/dlp-scrubber" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <DRIFT_MONITOR_API_TOKEN>" \
  -d '{"text":"hello"}'
```

## 6. Deployment smoke test

```bash
PRODUCTION_BASE_URL=https://your-app.vercel.app \
DRIFT_MONITOR_URL=https://<deployed-service-host> \
DRIFT_MONITOR_API_TOKEN=<token> \
MESH_AUTH_TOKEN_SECRET=<32-char-secret> \
python scripts/smoke_test_production.py
```

Exit 0 = pass; 1 = check failure (its DLP/sandbox probes fail on 503 until
this service is live and the Vercel variables match); 2 = misconfiguration.
Secrets are never printed by the script.

## 7. Rollback procedure

Revisions are immutable; rollback is traffic-only, no rebuild needed:

```bash
# List revisions, newest first:
gcloud run revisions list --service=guardrail-mesh-drift-monitor \
  --project=<GCP-PROJECT> --region=<REGION>

# Shift 100% traffic to the last known-good revision:
gcloud run services update-traffic guardrail-mesh-drift-monitor \
  --project=<GCP-PROJECT> --region=<REGION> \
  --to-revisions=<GOOD-REVISION>=100
```

Alternative (image-level): redeploy the manifest with `<TAG>` set to the
previous release SHA from the GitHub release summary
(`ghcr.io/<owner>/guardrail-red-team-harness-drift-monitor:<prev-sha>`),
re-apply, re-run §5–§6. The old revision stays available for instant
traffic rollback either way.

## 8. Future workflow integration (not applied)

`production-release.yml` Stage C currently POSTs an opaque
`DRIFT_MONITOR_DEPLOY_HOOK_URL`. Once this manifest is adopted, Stage C can
instead run `gcloud run services replace services/drift-monitor/cloud-run.yaml`
with `<TAG>` pinned to `${{ github.sha }}` (Workload Identity Federation, no
long-lived keys), keeping Stages D (health poll) and E (smoke test) unchanged.
The workflow is intentionally **not modified** in this phase.
