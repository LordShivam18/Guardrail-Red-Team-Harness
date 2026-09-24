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
    "003a_compliance_engine.sql",
  );
  const sql = neon(databaseUrl);
  for (const statement of splitPostgresStatements(readFileSync(migrationPath, "utf8"))) {
    await sql.query(statement);
  }

  const tables = (await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(${[
        "compliance_frameworks",
        "compliance_mappings",
        "compliance_evidence",
      ]})
  `) as { table_name: string }[];
  const actual = new Set(tables.map((row) => row.table_name));

  if (
    !actual.has("compliance_frameworks") ||
    !actual.has("compliance_mappings") ||
    !actual.has("compliance_evidence")
  ) {
    throw new Error("Compliance engine migration verification failed.");
  }

  console.log("[migrate:003a] compliance_frameworks table is ready.");
  console.log("[migrate:003a] compliance_mappings table is ready.");
  console.log("[migrate:003a] compliance_evidence table is ready.");
}

main().catch((error) => {
  console.error("[migrate:003a] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
