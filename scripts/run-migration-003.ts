import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "../lib/db";
import { loadLocalEnv } from "./env";

type CountRow = {
  count: number;
};

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
    "003_compliance_engine.sql"
  );
  const migrationSql = readFileSync(migrationPath, "utf8");

  for (const statement of splitSqlStatements(migrationSql)) {
    await sql.query(statement);
  }

  const [frameworkRows, mappingRows, evidenceRows] = await Promise.all([
    sql`select count(*)::int as count from compliance_frameworks`,
    sql`select count(*)::int as count from compliance_mappings`,
    sql`select count(*)::int as count from compliance_evidence`
  ]);
  const frameworkCount = ((frameworkRows as CountRow[])[0]?.count ?? 0).toLocaleString();
  const mappingCount = ((mappingRows as CountRow[])[0]?.count ?? 0).toLocaleString();
  const evidenceCount = ((evidenceRows as CountRow[])[0]?.count ?? 0).toLocaleString();

  console.log("[migrate:003:compliance] compliance_frameworks table is ready.");
  console.log("[migrate:003:compliance] compliance_mappings table is ready.");
  console.log("[migrate:003:compliance] compliance_evidence table is ready.");
  console.log(`[migrate:003:compliance] framework rows: ${frameworkCount}`);
  console.log(`[migrate:003:compliance] mapping rows: ${mappingCount}`);
  console.log(`[migrate:003:compliance] evidence rows: ${evidenceCount}`);
}

main().catch((error) => {
  console.error("[migrate:003:compliance] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});

function splitSqlStatements(sqlText: string) {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const nextChar = sqlText[index + 1];
    current += char;

    if (quote === "'" && char === "'" && nextChar === "'") {
      current += nextChar;
      index += 1;
      continue;
    }

    if ((char === "'" || char === '"') && quote === null) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (char === ";" && quote === null) {
      const statement = current.trim();

      if (statement) {
        statements.push(statement);
      }

      current = "";
    }
  }

  const trailingStatement = current.trim();

  if (trailingStatement) {
    statements.push(trailingStatement);
  }

  return statements;
}
