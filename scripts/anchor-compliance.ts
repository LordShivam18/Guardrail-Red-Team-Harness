import { sql } from "../lib/db";
import { anchorCertificate } from "../lib/onchainAnchor";
import { loadLocalEnv } from "./env";

type RunRow = {
  id: string;
  certificate_hash: string | null;
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

async function getRun(runId: string | null) {
  if (runId) {
    const rows = (await sql`
      select id, certificate_hash
      from redteam_runs
      where id = ${runId}::uuid
      limit 1
    `) as RunRow[];

    return rows[0] ?? null;
  }

  const rows = (await sql`
    select id, certificate_hash
    from redteam_runs
    order by timestamp desc
    limit 1
  `) as RunRow[];

  return rows[0] ?? null;
}

async function main() {
  loadLocalEnv();

  const run = await getRun(parseRunIdArg(process.argv.slice(2)));

  if (!run) {
    throw new Error("No matching redteam_runs row was found.");
  }

  if (!run.certificate_hash) {
    throw new Error(`Run ${run.id} does not have a certificate_hash to anchor.`);
  }

  const anchored = await anchorCertificate(run.certificate_hash);

  await sql`
    update redteam_runs
    set
      onchain_tx_hash = ${anchored.txHash},
      onchain_network = ${anchored.network}
    where id = ${run.id}::uuid
  `;

  console.log(`[compliance:anchor] runId=${run.id}`);
  console.log(`[compliance:anchor] network=${anchored.network}`);
  console.log(`[compliance:anchor] txHash=${anchored.txHash}`);
}

main().catch((error) => {
  console.error("[compliance:anchor] Failed to anchor compliance certificate.");
  console.error(error);
  process.exitCode = 1;
});
