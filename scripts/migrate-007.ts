import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { loadLocalEnv } from "./env";
import { splitPostgresStatements } from "./sqlMigration";

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL environment variable.");

  const migrationPath = resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "007_drift_monitoring.sql",
  );
  const sql = neon(databaseUrl);
  for (const statement of splitPostgresStatements(readFileSync(migrationPath, "utf8"))) {
    await sql.query(statement);
  }

  const rows = (await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'redteam_runs'
      and column_name = 'model_status'
  `) as { column_name: string }[];

  if (!rows[0]) throw new Error("Drift monitoring migration verification failed.");
  console.log("[migrate:007] redteam_runs.model_status is ready.");
}

main().catch((error) => {
  console.error("[migrate:007] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
