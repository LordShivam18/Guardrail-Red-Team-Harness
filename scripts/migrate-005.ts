import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { loadLocalEnv } from "./env";

type ColumnRow = { column_name: string };

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  const migrationPath = resolve(process.cwd(), "supabase", "migrations", "005_sovereign_index.sql");
  const migrationSql = readFileSync(migrationPath, "utf8");
  const sql = neon(databaseUrl);

  await sql.query(migrationSql);

  const rows = (await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'redteam_runs'
      and column_name = any(${[
        "sovereign_score",
        "compliance_status",
        "robustness_subscore",
        "privacy_subscore",
        "fuzzing_subscore",
      ]})
  `) as ColumnRow[];
  const actual = new Set(rows.map((row) => row.column_name));
  const required = [
    "sovereign_score",
    "compliance_status",
    "robustness_subscore",
    "privacy_subscore",
    "fuzzing_subscore",
  ];

  if (required.some((column) => !actual.has(column))) {
    throw new Error("Sovereign Index migration verification failed.");
  }

  console.log("[migrate:005] Sovereign Index columns are ready on redteam_runs.");
}

main().catch((error) => {
  console.error("[migrate:005] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
