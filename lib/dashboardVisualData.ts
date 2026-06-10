import { sql } from "./db";
import { calculateMeshScore } from "./meshScore";

type ParetoRunRow = {
  run_id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
  safety_sharpe: number;
  modalities_covered: string[] | null;
};

type DiagnosticsRunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  safety_mean: number;
  safety_variance: number;
};

type DiagnosticsResultRow = {
  id: string;
  created_at: string;
  blocked: boolean;
  outcome_flag: "PASSED" | "FAILED" | "FP" | "FN";
  raw_output: string | null;
  final_output: string | null;
  category: string | null;
  prompt_text: string | null;
};

export type ParetoDataRow = {
  id: string;
  model: string;
  modelVersion: string;
  timestamp: string;
  jailbreakRate: number;
  safetySharpe: number;
  safetyScore: number;
  utilityScore: number;
  meshScore: number;
};

export type WhiteboxTokenSegment = {
  highlighted: boolean;
  text: string;
};

export type WhiteboxTokenEvent = {
  id: string;
  timestamp: string;
  category: string;
  outcomeFlag: "PASSED" | "FAILED" | "FP" | "FN";
  blocked: boolean;
  tokens: WhiteboxTokenSegment[];
};

export type WhiteboxVariancePoint = {
  token: number;
  variance: number;
};

export type WhiteboxDiagnosticsData = {
  runId: string;
  modelVersion: string;
  timestamp: string;
  events: WhiteboxTokenEvent[];
  varianceSeries: WhiteboxVariancePoint[];
};

const DANGEROUS_TOKEN_PATTERN =
  /ignore|override|developer|system|prompt|bypass|dan|secret|token|pii|ssn|email|credit|card|decode|base64|filter|safety/i;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function tokenizeTrace(row: DiagnosticsResultRow): WhiteboxTokenSegment[] {
  const source = [row.prompt_text, row.raw_output, row.final_output]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ");
  const rawTokens = source.match(/\s+|[^\s]+/g) ?? ["<empty>"];
  const tokens = rawTokens.slice(0, 80).map((text) => ({
    highlighted:
      !/^\s+$/.test(text) &&
      (DANGEROUS_TOKEN_PATTERN.test(text) ||
        (row.blocked && (row.outcome_flag === "FAILED" || row.outcome_flag === "FN"))),
    text
  }));

  if (row.blocked && !tokens.some((token) => token.highlighted)) {
    const firstVisibleToken = tokens.find((token) => !/^\s+$/.test(token.text));

    if (firstVisibleToken) {
      firstVisibleToken.highlighted = true;
    }
  }

  return tokens;
}

function getVarianceSeries(safetyMean: number, safetyVariance: number): WhiteboxVariancePoint[] {
  const pointCount = 32;
  const meanPressure = 1 - clamp01(safetyMean);
  const variancePressure = Math.sqrt(Math.max(0, safetyVariance));
  const baseline = clamp01(meanPressure * 0.55 + variancePressure * 1.75);

  return Array.from({ length: pointCount }, (_, index) => {
    const position = pointCount <= 1 ? 0 : index / (pointCount - 1);
    const wave = Math.sin(index * 0.82 + safetyMean * 7) * variancePressure * 0.95;
    const saw = ((index % 5) / 5) * variancePressure * 0.8;

    return {
      token: index,
      variance: Number(clamp01(baseline + wave + saw + position * variancePressure).toFixed(4))
    };
  });
}

export async function getParetoFrontierRows(limit: number = 50): Promise<ParetoDataRow[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const rows = (await sql`
    select
      run_id,
      timestamp,
      model_version,
      jailbreak_rate,
      fp_rate,
      safety_sharpe
    from (
      select
        id as run_id,
        timestamp,
        model_version,
        jailbreak_rate,
        fp_rate,
        coalesce(safety_sharpe, 0) as safety_sharpe,
        coalesce(
          (
            select array_remove(
              array_agg(distinct coalesce(nullif(results.modality, ''), 'text')),
              null
            )
            from redteam_results results
            where results.run_id = redteam_runs.id
          ),
          array['text']::text[]
        ) as modalities_covered
      from redteam_runs
      order by timestamp desc
      limit ${safeLimit}
    ) recent_runs
    order by timestamp asc
  `) as ParetoRunRow[];

  const maxSharpe = Math.max(1, ...rows.map((row) => row.safety_sharpe));

  return rows.map((row) => ({
    id: row.run_id,
    model: row.model_version,
    modelVersion: row.model_version,
    timestamp: row.timestamp,
    jailbreakRate: row.jailbreak_rate,
    safetySharpe: row.safety_sharpe,
    safetyScore: clampScore((1 - row.jailbreak_rate) * 100),
    utilityScore: clampScore((Math.max(0, row.safety_sharpe) / maxSharpe) * 100),
    meshScore: calculateMeshScore(
      row.jailbreak_rate,
      row.fp_rate,
      row.safety_sharpe,
      normalizeModalities(row.modalities_covered)
    )
  }));
}

function normalizeModalities(values: string[] | null | undefined) {
  const modalities = (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return modalities.length > 0 ? [...new Set(modalities)] : ["text"];
}

export async function getWhiteboxDiagnosticsData(): Promise<WhiteboxDiagnosticsData | null> {
  const runRows = (await sql`
    select
      id,
      timestamp,
      model_version,
      coalesce(safety_mean, 0) as safety_mean,
      coalesce(safety_variance, 0) as safety_variance
    from redteam_runs
    order by timestamp desc
    limit 1
  `) as DiagnosticsRunRow[];
  const latestRun = runRows[0];

  if (!latestRun) {
    return null;
  }

  const resultRows = (await sql`
    select
      id,
      created_at,
      blocked,
      outcome_flag,
      raw_output,
      final_output,
      category,
      prompt_text
    from (
      select
        r.id,
        r.created_at,
        r.blocked,
        r.outcome_flag,
        r.raw_output,
        r.final_output,
        p.category,
        p.prompt_text
      from redteam_results r
      left join adversarial_prompts p on p.id = r.test_id
      where r.run_id = ${latestRun.id}::uuid
      order by r.created_at desc
      limit 20
    ) recent_results
    order by created_at asc
  `) as DiagnosticsResultRow[];

  return {
    runId: latestRun.id,
    modelVersion: latestRun.model_version,
    timestamp: latestRun.timestamp,
    events: resultRows.map((row) => ({
      id: row.id,
      timestamp: row.created_at,
      category: row.category ?? "unknown",
      outcomeFlag: row.outcome_flag,
      blocked: row.blocked,
      tokens: tokenizeTrace(row)
    })),
    varianceSeries: getVarianceSeries(latestRun.safety_mean, latestRun.safety_variance)
  };
}
