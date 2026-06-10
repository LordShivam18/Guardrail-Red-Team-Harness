import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { anchorCertificate } from "@/lib/onchainAnchor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnchorBody = {
  runId?: unknown;
};

type RunRow = {
  id: string;
  certificate_hash: string | null;
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isJsonRecord(rawBody)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const { runId } = rawBody as AnchorBody;

  if (typeof runId !== "string" || !runId.trim()) {
    return NextResponse.json({ error: "runId is required." }, { status: 400 });
  }

  try {
    const rows = (await sql`
      select id, certificate_hash
      from redteam_runs
      where id = ${runId.trim()}::uuid
      limit 1
    `) as RunRow[];
    const run = rows[0];

    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    if (!run.certificate_hash) {
      return NextResponse.json(
        { error: "Run does not have a certificate_hash to anchor." },
        { status: 400 }
      );
    }

    const anchored = await anchorCertificate(run.certificate_hash);

    await sql`
      update redteam_runs
      set
        onchain_tx_hash = ${anchored.txHash},
        onchain_network = ${anchored.network}
      where id = ${run.id}::uuid
    `;

    return NextResponse.json({
      txHash: anchored.txHash,
      network: anchored.network,
      certHash: run.certificate_hash
    });
  } catch (error) {
    console.error("[compliance:onchain-anchor] Failed to anchor certificate.");
    console.error(error);

    return NextResponse.json(
      { error: "Unable to anchor compliance certificate." },
      { status: 500 }
    );
  }
}
