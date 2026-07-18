import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { loadLocalEnv } from "./env";

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL environment variable.");

  const migrationPath = resolve(
    process.cwd(),
    "supabase",
    "migrations",
    "006_evolutionary_art.sql",
  );
  const sql = neon(databaseUrl);
  await sql.query(readFileSync(migrationPath, "utf8"));

  const rows = (await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'redteam_runs'
      and column_name = 'evolutionary_lineage'
  `) as { column_name: string }[];

  if (!rows[0]) throw new Error("Evolutionary ART migration verification failed.");
  console.log("[migrate:006] redteam_runs.evolutionary_lineage is ready.");
}

main().catch((error) => {
  console.error("[migrate:006] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
