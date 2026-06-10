import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateEvidencePack } from "../lib/complianceEvidence";
import { sql } from "../lib/db";
import { loadLocalEnv } from "./env";

type RunIdRow = {
  id: string;
};

function parseRunIdArg(args: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--runId") {
      return args[index + 1]?.trim() || null;
    }

    if (arg.startsWith("--runId=")) {
      return arg.slice("--runId=".length).trim() || null;
    }
  }

  return null;
}

async function getLatestRunId() {
  const rows = (await sql`
    select id
    from redteam_runs
    order by timestamp desc
    limit 1
  `) as RunIdRow[];

  return rows[0]?.id ?? null;
}

async function main() {
  loadLocalEnv();

  const runId = parseRunIdArg(process.argv.slice(2)) ?? (await getLatestRunId());

  if (!runId) {
    throw new Error("No runId was provided and no redteam_runs rows exist.");
  }

  const pack = await generateEvidencePack(runId);
  const output = JSON.stringify(pack, null, 2);
  const outputPath = resolve(process.cwd(), `compliance-evidence-${runId}.json`);

  console.log(output);
  writeFileSync(outputPath, `${output}\n`, "utf8");

  for (const framework of pack.frameworks) {
    console.log(
      `[compliance:generate] ${framework.code}: ${framework.overallStatus} (${framework.passCount}/${framework.controls.length} passed, ${framework.failCount} failed)`
    );
  }

  console.log(`[compliance:generate] JSON file written: ${outputPath}`);
}

main().catch((error) => {
  console.error("[compliance:generate] Failed to generate evidence pack.");
  console.error(error);
  process.exitCode = 1;
});
