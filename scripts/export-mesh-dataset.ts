import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "./env";

type ExpectedOutcome = "blocked" | "allowed";
type Severity = "critical" | "high" | "medium" | "low";

type MeshZeroDayRow = {
  id: string;
  payload_text: string;
  vector_category: string;
  mitre_atlas_id: string | null;
  owasp_llm_id: string | null;
  success_rate_historical: number;
  severity: string | null;
};

type AdversarialPromptRow = {
  id: string;
  prompt_text: string;
  expected_outcome: "refusal" | "safe" | string;
  category: string;
};

type CategoryTaxonomy = {
  mitreTtp: string;
  owaspLlm: string;
  severity: Severity;
};

type MeshDatasetRecord = {
  id: string;
  prompt: string;
  category: string;
  expected_outcome: ExpectedOutcome;
  mitre_ttp: string;
  owasp_llm: string;
  severity: Severity;
  mesh_version: string;
};

const MESH_VERSION = "1.0";
const EXPORT_FILE_NAME = "mesh-10k-v1.0.jsonl";
const DATACARD_FILE_NAME = "mesh-10k-v1.0-datacard.md";

const CATEGORY_TAXONOMY: Record<string, CategoryTaxonomy> = {
  "prompt injection": {
    mitreTtp: "T1059",
    owaspLlm: "LLM01",
    severity: "critical"
  },
  jailbreak: {
    mitreTtp: "T1204",
    owaspLlm: "LLM01",
    severity: "critical"
  },
  "pii extraction": {
    mitreTtp: "T1041",
    owaspLlm: "LLM06",
    severity: "critical"
  },
  "pii exfiltration": {
    mitreTtp: "T1041",
    owaspLlm: "LLM06",
    severity: "critical"
  },
  pii: {
    mitreTtp: "T1041",
    owaspLlm: "LLM06",
    severity: "critical"
  },
  csam: {
    mitreTtp: "T1204.002",
    owaspLlm: "LLM02",
    severity: "critical"
  },
  toxic: {
    mitreTtp: "T1204",
    owaspLlm: "LLM04",
    severity: "high"
  },
  "base64 encoding": {
    mitreTtp: "T1027",
    owaspLlm: "LLM01",
    severity: "high"
  },
  "deep roleplay": {
    mitreTtp: "T1204",
    owaspLlm: "LLM01",
    severity: "high"
  },
  "prefix injection": {
    mitreTtp: "T1059",
    owaspLlm: "LLM01",
    severity: "high"
  },
  "token splitting": {
    mitreTtp: "T1027.010",
    owaspLlm: "LLM01",
    severity: "medium"
  },
  "translation bypass": {
    mitreTtp: "T1027",
    owaspLlm: "LLM01",
    severity: "medium"
  },
  "context overflow": {
    mitreTtp: "T1499",
    owaspLlm: "LLM01",
    severity: "high"
  },
  "multi-turn escalation": {
    mitreTtp: "T1204",
    owaspLlm: "LLM01",
    severity: "high"
  },
  "markdown obfuscation": {
    mitreTtp: "T1027",
    owaspLlm: "LLM01",
    severity: "medium"
  },
  safe: {
    mitreTtp: "N/A",
    owaspLlm: "N/A",
    severity: "low"
  },
  "safe baseline": {
    mitreTtp: "N/A",
    owaspLlm: "N/A",
    severity: "low"
  }
};

function normalizeCategory(category: string) {
  return category.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function getCategoryTaxonomy(category: string, expectedOutcome: ExpectedOutcome) {
  const normalized = normalizeCategory(category);
  const mapped = CATEGORY_TAXONOMY[normalized];

  if (mapped) {
    return mapped;
  }

  if (expectedOutcome === "allowed") {
    return CATEGORY_TAXONOMY.safe;
  }

  return {
    mitreTtp: "T1204",
    owaspLlm: "LLM01",
    severity: "high"
  } satisfies CategoryTaxonomy;
}

function normalizeSeverity(
  severity: string | null | undefined,
  category: string,
  expectedOutcome: ExpectedOutcome
): Severity {
  const normalized = severity?.trim().toLowerCase();

  if (
    normalized === "critical" ||
    normalized === "high" ||
    normalized === "medium" ||
    normalized === "low"
  ) {
    return normalized;
  }

  return getCategoryTaxonomy(category, expectedOutcome).severity;
}

function normalizeOwasp(value: string | null | undefined, category: string, outcome: ExpectedOutcome) {
  const normalized = value?.trim().toUpperCase();

  if (normalized && /^LLM\d{2}$/.test(normalized)) {
    return normalized;
  }

  return getCategoryTaxonomy(category, outcome).owaspLlm;
}

function expectedOutcomeForMesh(row: MeshZeroDayRow): ExpectedOutcome {
  const category = normalizeCategory(row.vector_category);
  const owasp = row.owasp_llm_id?.trim().toUpperCase();

  if (
    category === "safe" ||
    category === "safe baseline" ||
    category === "benign" ||
    category === "control" ||
    row.severity?.trim().toLowerCase() === "none" ||
    owasp === "N/A"
  ) {
    return "allowed";
  }

  return "blocked";
}

function expectedOutcomeForPrompt(row: AdversarialPromptRow): ExpectedOutcome {
  return row.expected_outcome === "safe" ? "allowed" : "blocked";
}

function toDatasetRecord(
  index: number,
  prompt: string,
  category: string,
  expectedOutcome: ExpectedOutcome,
  sourceOwasp: string | null | undefined,
  sourceSeverity: string | null | undefined
): MeshDatasetRecord {
  const taxonomy = getCategoryTaxonomy(category, expectedOutcome);

  return {
    id: `mesh-${index}`,
    prompt,
    category,
    expected_outcome: expectedOutcome,
    mitre_ttp: taxonomy.mitreTtp,
    owasp_llm: normalizeOwasp(sourceOwasp, category, expectedOutcome),
    severity: normalizeSeverity(sourceSeverity, category, expectedOutcome),
    mesh_version: MESH_VERSION
  };
}

function buildDataCard(payloadCount: number, exportHash: string) {
  return `---
language:
  - en
license: apache-2.0
task_categories:
  - text-classification
tags:
  - red-teaming
  - safety
  - llm-evaluation
pretty_name: Mesh-10K
dataset_info:
  features:
    - name: id
      dtype: string
    - name: prompt
      dtype: string
    - name: category
      dtype: string
    - name: expected_outcome
      dtype: string
    - name: mitre_ttp
      dtype: string
    - name: owasp_llm
      dtype: string
    - name: severity
      dtype: string
    - name: mesh_version
      dtype: string
---

# Mesh-10K v${MESH_VERSION}

Mesh-10K is an adversarial red-team benchmark for LLM safety evaluation. This export contains ${payloadCount.toLocaleString(
    "en-US"
  )} prompts from Guardrail Mesh zero-day payloads and baseline adversarial prompts. Each record is normalized for text classification and safety evaluation workflows.

## Dataset Description

The dataset focuses on prompt injection, jailbreak attempts, PII exfiltration, obfuscation, roleplay escalation, and benign control prompts. Records are mapped to MITRE ATT&CK-style TTP identifiers and OWASP LLM Top 10 categories where applicable.

Export hash: \`${exportHash}\`

## Fields

- \`id\`: Stable export-local identifier in the form \`mesh-<n>\`.
- \`prompt\`: The prompt or payload text to evaluate.
- \`category\`: Source category label from Guardrail Mesh.
- \`expected_outcome\`: \`blocked\` for adversarial prompts or \`allowed\` for benign controls.
- \`mitre_ttp\`: MITRE ATT&CK-style TTP mapping, or \`N/A\` for benign controls.
- \`owasp_llm\`: OWASP LLM Top 10 category identifier, or \`N/A\` for benign controls.
- \`severity\`: Normalized severity: \`critical\`, \`high\`, \`medium\`, or \`low\`.
- \`mesh_version\`: Dataset schema/content version.

## Intended Use

- Benchmarking guardrail, moderation, and LLM gateway behavior.
- Regression testing model safety releases.
- Comparing false-positive and jailbreak resistance across model versions.
- Academic or industrial research on LLM safety evaluation.

## Out-of-Scope Use

- Training models to evade safety systems.
- Generating harmful content outside a controlled evaluation environment.
- Treating benchmark scores as a complete model safety certification without additional review.
- Deploying prompts against systems without authorization.
`;
}

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  const sql = neon(databaseUrl);
  const exportDir = resolve(process.cwd(), "exports");
  const jsonlPath = resolve(exportDir, EXPORT_FILE_NAME);
  const dataCardPath = resolve(exportDir, DATACARD_FILE_NAME);

  const meshRows = (await sql`
    select
      id,
      payload_text,
      vector_category,
      mitre_atlas_id,
      owasp_llm_id,
      success_rate_historical,
      severity
    from mesh_zero_days
    order by created_at asc, id asc
  `) as MeshZeroDayRow[];

  const promptRows = (await sql`
    select
      id,
      prompt_text,
      expected_outcome::text as expected_outcome,
      category
    from adversarial_prompts
    order by created_at asc, id asc
  `) as AdversarialPromptRow[];

  const records: MeshDatasetRecord[] = [];

  for (const row of meshRows) {
    const outcome = expectedOutcomeForMesh(row);
    records.push(
      toDatasetRecord(
        records.length + 1,
        row.payload_text,
        row.vector_category,
        outcome,
        row.owasp_llm_id,
        row.severity
      )
    );
  }

  for (const row of promptRows) {
    const outcome = expectedOutcomeForPrompt(row);
    records.push(
      toDatasetRecord(
        records.length + 1,
        row.prompt_text,
        row.category,
        outcome,
        null,
        null
      )
    );
  }

  if (!existsSync(exportDir)) {
    mkdirSync(exportDir, { recursive: true });
  }

  const jsonl = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  writeFileSync(jsonlPath, jsonl, "utf8");

  const exportHash = createHash("sha256").update(jsonl).digest("hex");
  writeFileSync(dataCardPath, buildDataCard(records.length, exportHash), "utf8");

  await sql`
    create table if not exists mesh_dataset_versions (
      id serial primary key,
      version varchar(20) not null,
      payload_count integer not null,
      export_hash varchar(64) not null,
      exported_at timestamptz default now(),
      changelog text
    )
  `;
  await sql`
    insert into mesh_dataset_versions (
      version,
      payload_count,
      export_hash,
      changelog
    )
    values (
      ${MESH_VERSION},
      ${records.length},
      ${exportHash},
      ${"Exported Mesh-10K v1.0 JSONL and Hugging Face dataset card."}
    )
  `;

  console.log(`[dataset] Wrote ${records.length} records to ${jsonlPath}`);
  console.log(`[dataset] Wrote Hugging Face dataset card to ${dataCardPath}`);
  console.log(`[dataset] SHA-256 ${exportHash}`);
  console.log("[dataset] Recorded mesh_dataset_versions row.");
}

main().catch((error) => {
  console.error("[dataset] Export failed.");
  console.error(error);
  process.exitCode = 1;
});
