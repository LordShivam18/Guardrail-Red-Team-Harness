# Guardrail & Red-Team Harness

A zero-cost, hardware-efficient regression harness for testing LLM guardrails before they reach users.

The project replays adversarial prompts against a guarded Gemini application, records the result in Neon Serverless Postgres, and surfaces failures in a Next.js dashboard for audit and incident response.

## Zero-Cost, Hardware-Efficient Design

This harness is designed to run on free or low-cost managed infrastructure without requiring a GPU workstation.

- Gemini 1.5 Flash provides the cloud LLM layer for fast, inexpensive adversarial replay.
- TensorFlow.js local toxicity checks run in-process, so moderation can be tested without another paid API.
- Regex PII scrubbers redact common sensitive patterns such as email addresses and likely credit card numbers.
- Neon Serverless Postgres stores prompt suites, run summaries, and incident logs with scale-to-zero economics.
- GitHub Actions runs scheduled regression tests without a dedicated CI server.
- Vercel serves the dashboard and allows a 30 second function timeout for first-load TensorFlow model initialization.

## Architecture

```text
Adversarial Prompt Suite
        |
        v
Gemini 1.5 Flash guarded response
        |
        v
TFJS local toxicity classifier
        |
        v
Regex PII scrubbing
        |
        v
Outcome classifier
        |
        v
Neon Serverless Postgres
        |
        v
Next.js dashboard
```

The runtime path is intentionally small: one cloud model, one local safety model, deterministic scrubbers, and standard SQL persistence.

## Metrics

**Jailbreak Success Rate**

The share of refusal-expected prompts that were not blocked.

```text
failed_refusal_expected_tests / total_refusal_expected_tests
```

A lower value is better. The production target is 0%.

**False Positive Rate**

The share of safe prompts that were incorrectly blocked.

```text
safe_prompts_blocked / total_safe_prompts
```

This tracks overblocking, which can damage user trust even when the safety posture is strong.

## Incident Response

Every harness run writes a `redteam_runs` summary and one `redteam_results` row per prompt. The dashboard loads the latest run, joins failed attempts back to their source prompts, and isolates the final output, raw output fallback, category, and outcome flag.

This makes audit work straightforward:

- `FAILED` rows show jailbreaks where refusal was expected but the system allowed the answer.
- `FP` rows show safe prompts that were blocked.
- Prompt category and captured output are displayed together for triage.
- Run IDs and timestamps give each replay a stable audit trail.

## Database

Apply the Postgres schema in `supabase/schema.sql` to your Neon database. The file name is historical; the schema uses standard Postgres tables, enums, indexes, UUID defaults, and cascading foreign keys.

Required environment variables:

```bash
DATABASE_URL=postgresql://user:password@your-neon-host.neon.tech/dbname?sslmode=require
GEMINI_API_KEY=your-gemini-api-key
ONCHAIN_PRIVATE_KEY=   # hex private key for Polygon Amoy anchoring; omit for simulation mode
ONCHAIN_RPC_URL=       # optional override; defaults to https://rpc-amoy.polygon.technology
```

## Scripts

```bash
npm run seed:prompts
npm run redteam:run
npm run cleanup:data
npm run migration:003
npm run compliance:generate
npm run compliance:anchor
```

`cleanup:data` deletes `redteam_runs` and `redteam_results` records older than 30 days to help keep storage usage inside Neon's free-tier limits.

## Automated Replays

`.github/workflows/nightly-redteam.yml` runs the harness on every push to `main`, on a nightly cron, and on manual dispatch. Configure these GitHub repository secrets before enabling it:

## Dashboard

The Next.js dashboard shows the latest run summary, jailbreak success rate, false positive rate, total test count, and incident log. It is optimized for regression review rather than marketing: the first screen is the operational control room.
