import { neon } from "@neondatabase/serverless";

type SqlClient = ReturnType<typeof neon>;
type RequiredTableRow = {
  table_name: string;
};
type HistoricalRunRow = {
  run_id: string;
  timestamp: string;
  jailbreak_rate: number;
  fp_rate: number;
};
type ModelComparisonSummaryRow = {
  model_name: string;
  total_interactions: number;
  total_attack_interactions: number;
  blocked_attempts: number;
  defusal_success_rate: number;
  average_latency_ms: number | null;
  false_positive_count: number;
};

export type HistoricalRunSummary = {
  runId: string;
  timestamp: string;
  jailbreakRate: number;
  fpRate: number;
};

export type ModelComparisonSummary = {
  modelName: string;
  totalInteractions: number;
  totalAttackInteractions: number;
  blockedAttempts: number;
  defusalSuccessRate: number;
  averageLatencyMs: number | null;
  falsePositiveCount: number;
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
    throw new Error("Invalid DATABASE_URL. Set DATABASE_URL to your Neon Postgres URL.");
  }

  sqlClient = neon(databaseUrl);
  return sqlClient;
}

const sqlProxy = ((strings: TemplateStringsArray, ...params: unknown[]) =>
  getSqlClient()(strings, ...params)) as SqlClient;

export const sql = new Proxy(sqlProxy, {
  get(_target, property) {
    const client = getSqlClient();
    const value = Reflect.get(client, property);

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  }
});

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
        "Apply supabase/schema.sql to the connected Neon database before running seed or harness scripts."
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
      fp_rate
    from (
      select
        id,
        timestamp,
        jailbreak_rate,
        fp_rate
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
    fpRate: row.fp_rate
  }));
}

export async function getModelComparisonSummary(): Promise<ModelComparisonSummary[]> {
  const rows = (await sql`
    with result_metrics as (
      select
        runs.model_version as model_name,
        results.outcome_flag::text as outcome_flag,
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
        category,
        case
          when raw_latency_ms ~ '^[0-9]+(\\.[0-9]+)?$'
            then raw_latency_ms::double precision
          else null
        end as latency_ms
      from result_metrics
    )
    select
      model_name,
      count(*)::int as total_interactions,
      count(*) filter (where category != 'safe')::int as total_attack_interactions,
      count(*) filter (
        where category != 'safe'
          and outcome_flag = 'PASSED'
      )::int as blocked_attempts,
      case
        when count(*) filter (where category != 'safe') = 0 then 0
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
      count(*) filter (where outcome_flag = 'FP')::int as false_positive_count
    from normalized_metrics
    group by model_name
    order by
      defusal_success_rate desc,
      average_latency_ms asc nulls last,
      total_interactions desc,
      model_name asc
  `) as ModelComparisonSummaryRow[];

  return rows.map((row) => ({
    modelName: row.model_name,
    totalInteractions: row.total_interactions,
    totalAttackInteractions: row.total_attack_interactions,
    blockedAttempts: row.blocked_attempts,
    defusalSuccessRate: row.defusal_success_rate,
    averageLatencyMs: row.average_latency_ms,
    falsePositiveCount: row.false_positive_count
  }));
}
