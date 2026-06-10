import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type VerifiedRunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
  certificate_hash: string;
  onchain_tx_hash: string | null;
  onchain_network: string | null;
};

function isLikelySha256(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const certificateHash = searchParams.get("cert")?.trim();

  if (!certificateHash || !isLikelySha256(certificateHash)) {
    return NextResponse.json({
      verified: false
    });
  }

  try {
    const rows = (await sql`
      select
        id,
        timestamp,
        model_version,
        jailbreak_rate,
        fp_rate,
        certificate_hash,
        nullif(to_jsonb(redteam_runs)->>'onchain_tx_hash', '') as onchain_tx_hash,
        nullif(to_jsonb(redteam_runs)->>'onchain_network', '') as onchain_network
      from redteam_runs
      where certificate_hash = ${certificateHash}
      limit 1
    `) as VerifiedRunRow[];
    const run = rows[0];

    if (!run) {
      return NextResponse.json({
        verified: false
      });
    }

    return NextResponse.json({
      verified: true,
      runDetails: {
        runId: run.id,
        timestamp: run.timestamp,
        modelVersion: run.model_version,
        jailbreakRate: run.jailbreak_rate,
        falsePositiveRate: run.fp_rate,
        certificateHash: run.certificate_hash,
        onchainTxHash: run.onchain_tx_hash,
        onchainNetwork: run.onchain_network
      }
    });
  } catch (error) {
    console.error("[verify] Certificate verification failed.");
    console.error(error);

    return NextResponse.json(
      {
        verified: false
      },
      { status: 500 }
    );
  }
}
