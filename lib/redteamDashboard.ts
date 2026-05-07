import { sql } from "./db";

type OutcomeFlag = "PASSED" | "FAILED" | "FP" | "FN";

type RunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
};

type ResultRow = {
  id: string;
  final_output: string | null;
  raw_output: string | null;
  outcome_flag: OutcomeFlag;
  created_at: string;
  category: string | null;
  prompt_text: string | null;
};

export type RunSummaryData = {
  runId: string;
  timestamp: string;
  modelVersion: string;
  jailbreakRate: number;
  falsePositiveRate: number;
  totalTests: number;
};

export type IncidentLogRow = {
  id: string;
  category: string;
  prompt: string;
  outcomeFlag: OutcomeFlag;
  finalOutput: string;
  createdAt: string;
};

export type IncidentLogData = {
  runId: string;
  timestamp: string;
  incidents: IncidentLogRow[];
};

async function getLatestRun() {
  const rows = (await sql`
    select
      id,
      timestamp,
      model_version,
      jailbreak_rate,
      fp_rate
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
    totalTests: countRows[0]?.total_tests ?? 0
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
    finalOutput: row.final_output ?? row.raw_output ?? "No output captured.",
    createdAt: row.created_at
  }));

  return {
    runId: latestRun.id,
    timestamp: latestRun.timestamp,
    incidents
  };
}
