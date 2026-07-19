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




# Guardrail Mesh // Sovereign AI Compliance Gateway

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Architecture](https://img.shields.io/badge/architecture-Zero--Trust-black)

**Guardrail Mesh** is an enterprise-grade, cryptographically secure evaluation gateway designed to audit and certify Large Language Models (LLMs) against strict sovereign regulatory frameworks (e.g., EU AI Act, NIST AI RMF). 

Moving beyond empirical "black-box" fuzzing, this platform introduces formal mathematical robustness bounds, differential privacy accounting, and immutable W3C Verifiable Credentials to ensure AI models are mathematically safe and legally compliant before deployment.

---

## 🏛️ Core Architecture

### 1. Zero-Trust Edge Security & Proxy
*   **Cryptographic Identity:** Naive API keys replaced with strict HS256 JWT validation, enforcing issuer, audience, and operator scopes.
*   **Compute Defense:** Edge-level Redis Token-Bucket rate limiting prevents DDoS and compute exhaustion, returning strict 429 JSON payloads with `x-request-id` injection for distributed tracing.
*   **Multi-Modal Routing:** Safely parses and bounds Base64 image and native audio byte streams, protecting the unified provider engine (OpenAI, Anthropic, Gemini) from payload smuggling and OOM attacks.

### 2. The Sovereign Regulatory Layer
*   **Formal Robustness Bounds:** Implements randomized smoothing equations to calculate strict $\epsilon$-bounds (Wilson score intervals, inverse Gaussian CDF) representing the model's exact safety radius against adversarial perturbations.
*   **Differential Privacy (DP) Accountant:** Audits formal training traces for $(\epsilon, \delta)$ compliance while conducting empirical Data Extraction and Membership Inference attack simulations within a protected boundary.
*   **Confidential Hardware Attestation:** Abstracted `EnclaveProvider` interfaces (AWS Nitro / Intel SGX) verify Platform Configuration Registers (PCRs) and SBOM digests before securely releasing model weights to ephemeral session keys.

### 3. Immutable Cryptographic Ledger
*   **W3C Verifiable Credentials (VC 2.0):** Model scores are not just saved; they are assembled into W3C-compliant audit packs and signed using an asymmetric KMS-backed `SIGN_VERIFY` cryptosystem.
*   **Decentralized Identifier (DID):** Exposes a public `did:web` registry for sovereign authority verification.
*   **Merkle Transparency Tree:** All evaluation artifacts are anchored to an append-only cryptographic ledger via continuous `previous_event_hash` chains.

---

## 🛠️ Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Framework** | Next.js 14 (App Router), TypeScript, React |
| **Security & Cryptography** | Node `crypto` (HMAC/ECDSA), W3C VCs, JWT |
| **Infrastructure** | Neon (Serverless Postgres), Redis (BullMQ / Rate Limiting) |
| **Testing & CI/CD** | Vitest, Playwright (E2E), GitHub Actions |
| **Design System** | Tailwind CSS (Strict Midnight Brutalist Aesthetic) |


Ran command: `git add .`
Ran command: `git commit -m "MAjor app upgrades "`
Ran command: `git push`

```markdown
# GUARDRAIL MESH // SOVEREIGN AI SECURITY ARCHITECTURE

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-14354C?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

================================================================================
EXECUTIVE SUMMARY
================================================================================

Guardrail Mesh is an enterprise-grade, multi-modal AI evaluation and compliance 
harness. It is engineered to audit Large Language Models (LLMs) and autonomous 
agents for strict regulatory compliance, specifically targeting the NIST AI RMF 
and the EU AI Act. 

Designed for zero-trust deployment, the architecture is completely containerized 
and optimized for air-gapped Sensitive Compartmented Information Facility (SCIF) 
environments. Guardrail Mesh ensures that AI interactions remain bound by strict 
safety, privacy, and logical constraints without sacrificing sovereign capability.

--------------------------------------------------------------------------------
CORE ARCHITECTURE // THE 7 PHASES
--------------------------------------------------------------------------------

[01] SOVEREIGN INDEX SCORING
     Immutable compliance reporting and cryptographic state tracking. Derives a 
     unified sovereign score from formalized robustness, privacy, and empirical 
     fuzzing statistics.

[02] EVOLUTIONARY ART ENGINE
     Automated Red-Teaming (ART) utilizing genetic algorithms to dynamically 
     mutate prompt injections, bypass filters, and generate multi-layered 
     adversarial payloads.

[03] AUTONOMOUS AGENT SANDBOX
     Simulated tool-use environments engineered to detect and trap agent 
     hijacking, indirect prompt injections, and catastrophic boundary failures.

[04] POST-MARKET DRIFT MONITORING
     Real-time KL Divergence calculation to statistically track model degradation 
     and temporal token-distribution drift in post-market deployments.

[05] AIR-GAPPED SCIF INFRASTRUCTURE
     A fully local, Dockerized deployment mesh utilizing standard PostgreSQL 
     and Redis. No external data telemetry; strictly isolated.

[06] MULTI-MODAL THREAT ANALYZER
     Defensive scanning across modalities:
     - Steganographic computer vision detection using pixel variance.
     - Quantitative structural data poisoning detection utilizing Scikit-Learn's 
       Isolation Forest.

[07] ZERO-TRUST DLP & SWARM VALIDATION
     Inline data loss prevention utilizing the Presidio Analyzer for semantic 
     entity redaction. Continuous assurance is enforced via automated multi-agent 
     swarm attacks running headlessly within GitHub Actions.

================================================================================
TECH STACK BREAKDOWN
================================================================================

> FRONTEND & API GATEWAY
  Next.js (TypeScript, App Router, Standalone Build)
  
> DATA SCIENCE MICROSERVICE
  Python, FastAPI, Scikit-learn, Numpy, Pillow, Presidio

> PERSISTENCE & CACHE
  PostgreSQL 16, Redis

> ORCHESTRATION & CI/CD
  Docker Compose, GitHub Actions

--------------------------------------------------------------------------------
QUICK START // DEPLOYMENT PROTOCOL
--------------------------------------------------------------------------------

Execute the following commands to spin up the local air-gapped mesh.

1. Configure `.env` with required encryption secrets:
   ```bash
   export POSTGRES_PASSWORD="your_secure_db_password"
   export DRIFT_WEBHOOK_SECRET="your_drift_hmac_secret"
   export MESH_AUTH_TOKEN_SECRET="replace-with-a-minimum-32-character-secret"
   ```

2. Boot the SCIF container mesh:
   ```bash
   docker-compose up -d --build --wait
   ```

3. Hydrate the relational schema and telemetry structures:
   ```bash
   npm run db:migrate
   ```

4. Execute the continuous assurance integration test (Multi-Agent Swarm):
   ```bash
   python scripts/ci_test_swarm.py
   ```






## ## AUTHOR & LICENSE


AUTHOR  :: [@LordShivam18](https://github.com/LordShivam18)
LICENSE :: MIT License
```

---

## 🚀 Getting Started

### Local Deployment
1. **Clone & Install:**
   ```bash
   git clone [https://github.com/LordShivam18/guardrail-mesh.git](https://github.com/LordShivam18/guardrail-mesh.git)
   cd guardrail-mesh
   npm install
