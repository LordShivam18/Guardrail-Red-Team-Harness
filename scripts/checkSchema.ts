import { loadLocalEnv } from "./env";
import { sql } from "../lib/db";

type MissingItem = {
  what: string;
  expected: string;
  remediation: string;
};

const COLUMN_CHECKS: {
  table: string;
  column: string;
  expected: string;
  remediation: string;
}[] = [
  {
    table: "redteam_results",
    column: "modality",
    expected: "supabase/migrations/004_phase9_modality.sql",
    remediation: "npm run db:migrate:004",
  },
  {
    table: "adversarial_prompts",
    column: "modality",
    expected: "supabase/migrations/004_phase9_modality.sql",
    remediation: "npm run db:migrate:004",
  },
  {
    table: "redteam_runs",
    column: "sovereign_score",
    expected: "supabase/migrations/005_sovereign_index.sql",
    remediation: "npm run db:migrate:005",
  },
  {
    table: "redteam_runs",
    column: "compliance_status",
    expected: "supabase/migrations/005_sovereign_index.sql",
    remediation: "npm run db:migrate:005",
  },
  {
    table: "redteam_runs",
    column: "robustness_subscore",
    expected: "supabase/migrations/005_sovereign_index.sql",
    remediation: "npm run db:migrate:005",
  },
  {
    table: "redteam_runs",
    column: "privacy_subscore",
    expected: "supabase/migrations/005_sovereign_index.sql",
    remediation: "npm run db:migrate:005",
  },
  {
    table: "redteam_runs",
    column: "fuzzing_subscore",
    expected: "supabase/migrations/005_sovereign_index.sql",
    remediation: "npm run db:migrate:005",
  },
  {
    table: "redteam_runs",
    column: "evolutionary_lineage",
    expected: "supabase/migrations/006_evolutionary_art.sql",
    remediation: "npm run db:migrate:006",
  },
  {
    table: "redteam_runs",
    column: "model_status",
    expected: "supabase/migrations/007_drift_monitoring.sql",
    remediation: "npm run db:migrate:007",
  },
  {
    table: "redteam_runs",
    column: "onchain_tx_hash",
    expected: "supabase/migrations/003a_compliance_engine.sql",
    remediation: "npm run db:migrate:003a",
  },
  {
    table: "redteam_runs",
    column: "onchain_network",
    expected: "supabase/migrations/003a_compliance_engine.sql",
    remediation: "npm run db:migrate:003a",
  },
];

const TABLE_CHECKS: {
  table: string;
  expected: string;
  remediation: string;
}[] = [
  {
    table: "adversarial_prompts",
    expected: "supabase/schema.sql",
    remediation: "Apply supabase/schema.sql to the connected database",
  },
  {
    table: "redteam_runs",
    expected: "supabase/schema.sql",
    remediation: "Apply supabase/schema.sql to the connected database",
  },
  {
    table: "redteam_results",
    expected: "supabase/schema.sql",
    remediation: "Apply supabase/schema.sql to the connected database",
  },
  {
    table: "compliance_frameworks",
    expected: "supabase/migrations/003a_compliance_engine.sql",
    remediation: "npm run db:migrate:003a",
  },
  {
    table: "compliance_mappings",
    expected: "supabase/migrations/003a_compliance_engine.sql",
    remediation: "npm run db:migrate:003a",
  },
  {
    table: "compliance_evidence",
    expected: "supabase/migrations/003a_compliance_engine.sql",
    remediation: "npm run db:migrate:003a",
  },
  {
    table: "agentic_tool_sequences",
    expected: "supabase/migrations/004_phase9_modality.sql",
    remediation: "npm run db:migrate:004",
  },
];

export function formatSchemaGap(item: MissingItem): string {
  return [
    "ERROR:",
    item.what,
    "",
    "EXPECTED:",
    item.expected,
    "",
    "REMEDIATION:",
    item.remediation,
  ].join("\n");
}

export function buildMissingColumnItems(
  existing: Set<string>,
  checks: typeof COLUMN_CHECKS = COLUMN_CHECKS,
): MissingItem[] {
  return checks
    .filter(({ table, column }) => !existing.has(`${table}.${column}`))
    .map(({ table, column, expected, remediation }) => ({
      what: `${table}.${column} is missing`,
      expected,
      remediation,
    }));
}

export function buildMissingTableItems(
  existing: Set<string>,
  checks: typeof TABLE_CHECKS = TABLE_CHECKS,
): MissingItem[] {
  return checks
    .filter(({ table }) => !existing.has(table))
    .map(({ table, expected, remediation }) => ({
      what: `table ${table} is missing`,
      expected,
      remediation,
    }));
}

async function main() {
  loadLocalEnv();

  const { assertRequiredTablesExist } = await import("../lib/db");

  await assertRequiredTablesExist();

  const columnRows = (await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  `) as { table_name: string; column_name: string }[];
  const existingColumns = new Set(
    columnRows.map((row) => `${row.table_name}.${row.column_name}`),
  );

  const tableRows = (await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `) as { table_name: string }[];
  const existingTables = new Set(tableRows.map((row) => row.table_name));

  const missing: MissingItem[] = [
    ...buildMissingTableItems(existingTables),
    ...buildMissingColumnItems(existingColumns),
  ];

  if (missing.length > 0) {
    for (const item of missing) {
      console.error(formatSchemaGap(item));
      console.error("");
    }

    throw new Error(
      `Database schema is behind the application. ${missing.length} schema gap(s) detected. ` +
        `Apply the EXPECTED migrations above, or run npm run db:migrate:all for the full deterministic chain.`,
    );
  }

  console.log("[db] Extended schema verification passed (tables + lifecycle columns).");
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    console.error("Database schema check failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
