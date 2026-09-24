import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { neon } from "@neondatabase/serverless";

import { loadLocalEnv } from "./env";
import { splitPostgresStatements } from "./sqlMigration";

// Canonical deterministic order. Filenames use unique 003a/003b prefixes so
// lexical sorting and this explicit list agree.
const ORDERED_MIGRATIONS = [
  "003a_compliance_engine.sql",
  "003b_mesh_dataset_versions.sql",
  "004_phase9_modality.sql",
  "005_sovereign_index.sql",
  "006_evolutionary_art.sql",
  "007_drift_monitoring.sql",
] as const;

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL environment variable.");

  const sql = neon(databaseUrl);

  for (const file of ORDERED_MIGRATIONS) {
    const migrationPath = resolve(process.cwd(), "supabase", "migrations", file);
    const migrationSql = readFileSync(migrationPath, "utf8");

    for (const statement of splitPostgresStatements(migrationSql)) {
      await sql.query(statement);
    }

    console.log(`[migrate:all] applied ${file}`);
  }

  console.log("[migrate:all] all migrations applied in deterministic order.");
}

main().catch((error) => {
  console.error("[migrate:all] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
