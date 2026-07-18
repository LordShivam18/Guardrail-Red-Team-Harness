import postgres from "postgres";
import { calculateMeshScore, getMeshTier } from "./meshScore";
import type { MeshTier } from "./meshScore";

/**
 * A native PostgreSQL client keeps the application compatible with both Neon
 * and the isolated PostgreSQL 16 container used by the SCIF deployment.
 */
type SqlClient = ReturnType<typeof postgres>;
type TaggedSqlClient = {
  (_strings: TemplateStringsArray, ..._params: unknown[]): Promise<unknown>;
  query(_statement: string): Promise<unknown>;
};
type RequiredTableRow = {
  table_name: string;
};
type HistoricalRunRow = {
  run_id: string;
  timestamp: string;
  jailbreak_rate: number;
  fp_rate: number;
  sovereign_score: number | null;
  compliance_status: "CERTIFIED" | "REVOKED" | "NON_COMPLIANT" | null;
};
type ModelComparisonSummaryRow = {
  model_name: string;
  total_interactions: number;
  total_attack_interactions: number;
  blocked_attempts: number;
  defusal_success_rate: number;
  average_latency_ms: number | null;
  false_positive_count: number;
  avg_jailbreak_rate: number;
  avg_fp_rate: number;
  avg_safety_sharpe: number;
  modalities_covered: string[] | null;
};

export type HistoricalRunSummary = {
  runId: string;
  timestamp: string;
  jailbreakRate: number;
  fpRate: number;
  sovereignScore: number | null;
  complianceStatus: "CERTIFIED" | "REVOKED" | "NON_COMPLIANT" | null;
};

export type ModelComparisonSummary = {
  modelName: string;
  meshScore: number;
  tier: MeshTier;
  totalInteractions: number;
  totalAttackInteractions: number;
  blockedAttempts: number;
  defusalSuccessRate: number;
  averageLatencyMs: number | null;
  falsePositiveCount: number;
  avgJailbreakRate: number;
  avgFpRate: number;
  avgSafetySharpe: number;
  modalitiesCovered: string[];
};

let sqlClient: SqlClient | undefined;
const REQUIRED_SCHEMA_TABLES = [
  "adversarial_prompts",
  "redteam_runs",
  "redteam_results"
] as const;

function getSqlClient() {
  if (sqlClient) {
    return sqlClient;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error("Invalid DATABASE_URL. Set it to a PostgreSQL connection URL.");
  }

  sqlClient = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 10
  });
  return sqlClient;
}

const sqlProxy = ((strings: TemplateStringsArray, ...params: unknown[]) =>
  (getSqlClient() as unknown as TaggedSqlClient)(strings, ...params)) as TaggedSqlClient;

// Legacy migration scripts use `.query()` for complete SQL statements.  The
// direct PostgreSQL client calls this `.unsafe()`; this internal wrapper keeps
// the established application API while statements remain local source files.
sqlProxy.query = (statement: string) => getSqlClient().unsafe(statement);

export const sql = new Proxy(sqlProxy, {
  get(_target, property) {
    if (property === "query") {
      return sqlProxy.query;
    }

    const client = getSqlClient();
    const value = Reflect.get(client, property);

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  }
}) as TaggedSqlClient;

export async function assertRequiredTablesExist(
  tableNames: readonly string[] = REQUIRED_SCHEMA_TABLES
) {
  const rows = (await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(${[...tableNames]})
  `) as RequiredTableRow[];
  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = tableNames.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      [
        `Database schema is not synchronized. Missing required table(s): ${missingTables.join(
          ", "
        )}.`,
        "Apply supabase/schema.sql to the connected PostgreSQL database before running seed or harness scripts."
      ].join(" ")
    );
  }

  console.log(`[db] Schema check passed for table(s): ${tableNames.join(", ")}.`);
}

export async function getHistoricalRunSummary(
  limit: number = 7
): Promise<HistoricalRunSummary[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const rows = (await sql`
    select
      id as run_id,
      timestamp,
      jailbreak_rate,
      fp_rate,
      sovereign_score,
      compliance_status
    from (
      select
        id,
        timestamp,
        jailbreak_rate,
        fp_rate,
        nullif(to_jsonb(redteam_runs)->>'sovereign_score', '')::integer as sovereign_score,
        nullif(to_jsonb(redteam_runs)->>'compliance_status', '') as compliance_status
      from redteam_runs
      order by timestamp desc
      limit ${safeLimit}
    ) recent_runs
    order by timestamp asc
  `) as HistoricalRunRow[];

  return rows.map((row) => ({
    runId: row.run_id,
    timestamp: row.timestamp,
    jailbreakRate: row.jailbreak_rate,
    fpRate: row.fp_rate,
    sovereignScore: row.sovereign_score,
    complianceStatus: row.compliance_status
  }));
}

export async function getModelComparisonSummary(): Promise<ModelComparisonSummary[]> {
  const rows = (await sql`
    with run_metrics as (
      select
        model_version as model_name,
        count(*)::int as run_count,
        round(avg(jailbreak_rate)::numeric, 4)::double precision as avg_jailbreak_rate,
        round(avg(fp_rate)::numeric, 4)::double precision as avg_fp_rate,
        round(avg(coalesce(safety_sharpe, 0))::numeric, 4)::double precision
          as avg_safety_sharpe,
        round(((1 - avg(jailbreak_rate)) * 100)::numeric, 2)::double precision
          as run_defusal_success_rate
      from redteam_runs
      group by model_version
    ),
    result_metrics as (
      select
        runs.model_version as model_name,
        results.outcome_flag::text as outcome_flag,
        coalesce(nullif(to_jsonb(results)->>'modality', ''), 'text') as modality,
        coalesce(nullif(lower(trim(prompts.category)), ''), 'unknown') as category,
        nullif(
          coalesce(
            to_jsonb(results)->>'latency_ms',
            to_jsonb(results)->>'execution_latency_ms',
            to_jsonb(results)->>'processing_latency_ms',
            to_jsonb(results)->>'latency'
          ),
          ''
        ) as raw_latency_ms
      from redteam_results results
      inner join redteam_runs runs on runs.id = results.run_id
      left join adversarial_prompts prompts on prompts.id = results.test_id
    ),
    normalized_metrics as (
      select
        model_name,
        outcome_flag,
        modality,
        category,
        case
          when raw_latency_ms ~ '^[0-9]+(\\.[0-9]+)?$'
            then raw_latency_ms::double precision
          else null
        end as latency_ms
      from result_metrics
    ),
    result_aggregates as (
      select
        model_name,
        count(*)::int as total_interactions,
        count(*) filter (where category != 'safe')::int as total_attack_interactions,
        count(*) filter (
          where category != 'safe'
            and outcome_flag = 'PASSED'
        )::int as blocked_attempts,
        case
          when count(*) filter (where category != 'safe') = 0 then null
          else round(
            (
              (
                count(*) filter (
                  where category != 'safe'
                    and outcome_flag = 'PASSED'
                )
              )::double precision
              / nullif((count(*) filter (where category != 'safe'))::double precision, 0)
              * 100
            )::numeric,
            2
          )::double precision
        end as defusal_success_rate,
        round(avg(latency_ms)::numeric, 2)::double precision as average_latency_ms,
        count(*) filter (where outcome_flag = 'FP')::int as false_positive_count,
        array_remove(array_agg(distinct modality), null) as modalities_covered
      from normalized_metrics
      group by model_name
    )
    select
      run_metrics.model_name,
      run_metrics.avg_jailbreak_rate,
      run_metrics.avg_fp_rate,
      run_metrics.avg_safety_sharpe,
      coalesce(result_aggregates.total_interactions, run_metrics.run_count)::int
        as total_interactions,
      coalesce(
        nullif(result_aggregates.total_attack_interactions, 0),
        run_metrics.run_count
      )::int as total_attack_interactions,
      coalesce(
        result_aggregates.blocked_attempts,
        round(
          ((run_metrics.run_defusal_success_rate / 100) * run_metrics.run_count)::numeric,
          0
        )::int
      )::int as blocked_attempts,
      coalesce(
        result_aggregates.defusal_success_rate,
        run_metrics.run_defusal_success_rate
      )::double precision as defusal_success_rate,
      result_aggregates.average_latency_ms,
      coalesce(
        result_aggregates.false_positive_count,
        round((run_metrics.avg_fp_rate * run_metrics.run_count)::numeric, 0)::int
      )::int as false_positive_count,
      coalesce(result_aggregates.modalities_covered, array['text']::text[]) as modalities_covered
    from run_metrics
    left join result_aggregates
      on result_aggregates.model_name = run_metrics.model_name
    order by
      round(
        (
          1000
          - run_metrics.avg_jailbreak_rate * 500
          - run_metrics.avg_fp_rate * 500
          + run_metrics.avg_safety_sharpe * 10
        )::numeric,
        0
      ) desc,
      average_latency_ms asc nulls last,
      total_interactions desc,
      model_name asc
  `) as ModelComparisonSummaryRow[];

  const summaries = rows.map((row) => {
    const modalitiesCovered = normalizeModalities(row.modalities_covered);
    const meshScore = calculateMeshScore(
      row.avg_jailbreak_rate,
      row.avg_fp_rate,
      row.avg_safety_sharpe,
      modalitiesCovered
    );

    return {
      modelName: row.model_name,
      meshScore,
      tier: getMeshTier(meshScore),
      totalInteractions: row.total_interactions,
      totalAttackInteractions: row.total_attack_interactions,
      blockedAttempts: row.blocked_attempts,
      defusalSuccessRate: row.defusal_success_rate,
      averageLatencyMs: row.average_latency_ms,
      falsePositiveCount: row.false_positive_count,
      avgJailbreakRate: row.avg_jailbreak_rate,
      avgFpRate: row.avg_fp_rate,
      avgSafetySharpe: row.avg_safety_sharpe,
      modalitiesCovered
    };
  });

  return summaries.sort((left, right) => {
    if (right.meshScore !== left.meshScore) {
      return right.meshScore - left.meshScore;
    }

    if (right.defusalSuccessRate !== left.defusalSuccessRate) {
      return right.defusalSuccessRate - left.defusalSuccessRate;
    }

    return left.modelName.localeCompare(right.modelName);
  });
}

function normalizeModalities(values: string[] | null | undefined) {
  const modalities = (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return modalities.length > 0 ? [...new Set(modalities)] : ["text"];
}
