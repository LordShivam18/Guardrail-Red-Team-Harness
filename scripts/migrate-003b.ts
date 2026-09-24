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
    "003b_mesh_dataset_versions.sql",
  );
  const sql = neon(databaseUrl);
  for (const statement of splitPostgresStatements(readFileSync(migrationPath, "utf8"))) {
    await sql.query(statement);
  }

  const rows = (await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'mesh_dataset_versions'
  `) as { table_name: string }[];

  if (!rows[0]) throw new Error("Mesh dataset versions migration verification failed.");
  console.log("[migrate:003b] mesh_dataset_versions table is ready.");
}

main().catch((error) => {
  console.error("[migrate:003b] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
