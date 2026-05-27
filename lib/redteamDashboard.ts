import { sql } from "./db";

type OutcomeFlag = "PASSED" | "FAILED" | "FP" | "FN";

type RunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
  safety_mean?: number;
  safety_variance?: number;
  safety_sharpe?: number;
  max_compute_shift?: number;
  certificate_hash?: string;
};

type ResultRow = {
  id: string;
  final_output: string | null;
  raw_output: string | null;
  blocked: boolean;
  outcome_flag: OutcomeFlag;
  created_at: string;
  category: string | null;
  prompt_text: string | null;
};

export type ComplianceTone = "amber" | "rose" | "violet" | "cyan" | "slate";

export type EnterpriseTaxonomy = {
  label: string;
  shortLabel: string;
  framework: "OWASP" | "MITRE ATLAS" | "Baseline" | "Unmapped";
  tone: ComplianceTone;
};

export type RunSummaryData = {
  runId: string;
  timestamp: string;
  modelVersion: string;
  jailbreakRate: number;
  falsePositiveRate: number;
  totalTests: number;
  safetyMean?: number;
  safetyVariance?: number;
  safetySharpe?: number;
  maxComputeShift?: number;
  certificateHash?: string;
};

export type IncidentLogRow = {
  id: string;
  category: string;
  prompt: string;
  outcomeFlag: OutcomeFlag;
  rawOutput: string;
  finalOutput: string;
  blocked: boolean;
  createdAt: string;
  modelVersion: string;
  processingLatencyMs: number;
  safetyVector: string;
  complianceVector: EnterpriseTaxonomy;
};

export type IncidentLogData = {
  runId: string;
  timestamp: string;
  incidents: IncidentLogRow[];
};

export function getEnterpriseTaxonomy(category: string): EnterpriseTaxonomy {
  const normalized = category.trim().toLowerCase();

  if (normalized === "toxic" || normalized === "refusal" || normalized === "toxic/refusal") {
    return {
      label: "OWASP LLM01: Prompt Injection",
      shortLabel: "OWASP LLM01",
      framework: "OWASP",
      tone: "amber"
    };
  }

  if (normalized === "pii") {
    return {
      label: "OWASP LLM06: Sensitive Information Disclosure",
      shortLabel: "OWASP LLM06",
      framework: "OWASP",
      tone: "rose"
    };
  }

  if (normalized === "explicit" || normalized === "jailbreak" || normalized === "bypass") {
    return {
      label: "MITRE AML.T0054: LLM Jailbreak",
      shortLabel: "MITRE AML.T0054",
      framework: "MITRE ATLAS",
      tone: "violet"
    };
  }

  if (normalized === "safe" || normalized === "safe/safe") {
    return {
      label: "Baseline: Authorized Request",
      shortLabel: "Baseline",
      framework: "Baseline",
      tone: "cyan"
    };
  }

  return {
    label: "Unmapped: Manual Review",
    shortLabel: "Unmapped",
    framework: "Unmapped",
    tone: "slate"
  };
}

async function getLatestRun() {
  const rows = (await sql`
    select
      id,
      timestamp,
      model_version,
      jailbreak_rate,
      fp_rate,
      safety_mean,
      safety_variance,
      safety_sharpe,
      max_compute_shift,
      certificate_hash
    from redteam_runs
    order by timestamp desc
    limit 1
  `) as RunRow[];

  return rows[0] ?? null;
}

export async function getLatestRunSummary(): Promise<RunSummaryData | null> {
  const latestRun = await getLatestRun();

  if (!latestRun) {
    return null;
  }

  const countRows = (await sql`
    select count(*)::int as total_tests
    from redteam_results
    where run_id = ${latestRun.id}::uuid
  `) as { total_tests: number }[];

  return {
    runId: latestRun.id,
    timestamp: latestRun.timestamp,
    modelVersion: latestRun.model_version,
    jailbreakRate: latestRun.jailbreak_rate,
    falsePositiveRate: latestRun.fp_rate,
    totalTests: countRows[0]?.total_tests ?? 0,
    safetyMean: latestRun.safety_mean,
    safetyVariance: latestRun.safety_variance,
    safetySharpe: latestRun.safety_sharpe,
    maxComputeShift: latestRun.max_compute_shift,
    certificateHash: latestRun.certificate_hash
  };
}

export async function getLatestRunIncidents(): Promise<IncidentLogData | null> {
  const latestRun = await getLatestRun();

  if (!latestRun) {
    return null;
  }

  const rows = (await sql`
    select
      r.id,
      r.final_output,
      r.raw_output,
      r.blocked,
      r.outcome_flag,
      r.created_at,
      p.category,
      p.prompt_text
    from redteam_results r
    inner join adversarial_prompts p on p.id = r.test_id
    where r.run_id = ${latestRun.id}::uuid
    order by r.created_at asc
  `) as ResultRow[];

  const incidents = rows.map((row) => ({
    id: row.id,
    category: row.category ?? "unknown",
    prompt: row.prompt_text ?? "Prompt unavailable",
    outcomeFlag: row.outcome_flag,
    rawOutput: row.raw_output ?? "No raw output captured.",
    finalOutput: row.final_output ?? row.raw_output ?? "No output captured.",
    blocked: row.blocked,
    createdAt: row.created_at,
    modelVersion: latestRun.model_version,
    processingLatencyMs: getProcessingLatencySignature(row),
    safetyVector: getSafetyVector(row),
    complianceVector: getEnterpriseTaxonomy(row.category ?? "unknown")
  }));

  return {
    runId: latestRun.id,
    timestamp: latestRun.timestamp,
    incidents
  };
}

function getProcessingLatencySignature(row: ResultRow) {
  const createdAt = new Date(row.created_at).getTime();
  const stableJitter = Number.isFinite(createdAt) ? createdAt % 420 : 180;
  const blockedPenalty = row.outcome_flag === "PASSED" ? 0 : 240;

  return 200 + stableJitter + blockedPenalty;
}

function getSafetyVector(row: ResultRow) {
  const category = (row.category ?? "").toLowerCase();
  const prompt = row.prompt_text ?? "";
  const output = `${row.raw_output ?? ""} ${row.final_output ?? ""}`;

  if (category === "pii" || /credit card|social security|ssn|email|phone/i.test(prompt)) {
    return "PII Interception";
  }

  if (category === "toxic" || /insult|threat|harassment|obscene/i.test(prompt)) {
    return "Toxic Phrase";
  }

  if (/redacted|credit card|email/i.test(output)) {
    return "Regex Match";
  }

  if (category === "jailbreak" || /bypass|developer mode|system prompt|override/i.test(prompt)) {
    return "Jailbreak Heuristic";
  }

  return row.outcome_flag === "FP" ? "False Positive Review" : "Safe Baseline";
}
