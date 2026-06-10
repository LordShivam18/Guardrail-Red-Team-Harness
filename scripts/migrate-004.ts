import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "./env";

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  const migrationPath = resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "004_phase9_modality.sql"
  );
  const migrationSql = readFileSync(migrationPath, "utf8");
  const sql = neon(databaseUrl);

  await sql.query(migrationSql);

  const redteamColumns = (await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'redteam_results'
      and column_name = 'modality'
  `) as { column_name: string }[];

  const promptColumns = (await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'adversarial_prompts'
      and column_name = 'modality'
  `) as { column_name: string }[];

  const agenticTables = (await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'agentic_tool_sequences'
  `) as { table_name: string }[];

  if (!redteamColumns[0] || !promptColumns[0] || !agenticTables[0]) {
    throw new Error("Phase 9 migration verification failed.");
  }

  console.log("[migrate:004] redteam_results.modality column is ready.");
  console.log("[migrate:004] adversarial_prompts.modality column is ready.");
  console.log("[migrate:004] agentic_tool_sequences table is ready.");
}

main().catch((error) => {
  console.error("[migrate:004] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
