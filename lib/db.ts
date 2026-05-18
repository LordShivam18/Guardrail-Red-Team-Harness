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

export type HistoricalRunSummary = {
  runId: string;
  timestamp: string;
  jailbreakRate: number;
  fpRate: number;
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
