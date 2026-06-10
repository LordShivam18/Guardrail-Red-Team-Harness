import { NextResponse } from "next/server";
import { getRegistryLeaderboard } from "@/lib/meshRegistry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600"
};

export async function GET() {
  try {
    const leaderboard = await getRegistryLeaderboard();

    return NextResponse.json(
      {
        version: "1.0",
        generated_at: new Date().toISOString(),
        models: leaderboard.map((entry) => ({
          rank: entry.rank,
          model_version: entry.modelVersion,
          mesh_score: entry.meshScore,
          tier: entry.tier,
          jailbreak_rate: entry.avgJailbreakRate,
          fp_rate: entry.avgFpRate,
          safety_sharpe: entry.avgSafetySharpe,
          modalities_covered: entry.modalitiesCovered,
          certificate_hash: entry.certificateHash ?? "",
          evaluated_at: new Date(entry.latestRun).toISOString()
        }))
      },
      { headers: PUBLIC_HEADERS }
    );
  } catch (error) {
    console.error("[api/leaderboard/public] Error:", error);

    return NextResponse.json(
      {
        version: "1.0",
        generated_at: new Date().toISOString(),
        models: [],
        error: "Failed to load public leaderboard."
      },
      { headers: PUBLIC_HEADERS, status: 500 }
    );
  }
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      ...PUBLIC_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    status: 204
  });
}
