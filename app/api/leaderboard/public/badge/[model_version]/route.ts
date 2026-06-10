import { NextResponse } from "next/server";
import { getRegistryLeaderboard } from "@/lib/meshRegistry";
import type { MeshTier } from "@/lib/meshScore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=3600"
};

function badgeColor(tier: MeshTier) {
  switch (tier) {
    case "PLATINUM":
      return "blueviolet";
    case "GOLD":
      return "gold";
    case "SILVER":
      return "silver";
    case "BRONZE":
      return "orange";
    default:
      return "lightgrey";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { model_version: string } }
) {
  try {
    const modelVersion = decodeURIComponent(params.model_version);
    const leaderboard = await getRegistryLeaderboard();
    const entry = leaderboard.find((item) => item.modelVersion === modelVersion);

    if (!entry) {
      return NextResponse.json(
        {
          schemaVersion: 1,
          label: "Guardrail Mesh",
          message: "not evaluated",
          color: "lightgrey"
        },
        { headers: PUBLIC_HEADERS, status: 404 }
      );
    }

    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "Guardrail Mesh",
        message: `${entry.tier} · ${entry.meshScore}`,
        color: badgeColor(entry.tier)
      },
      { headers: PUBLIC_HEADERS }
    );
  } catch (error) {
    console.error("[api/leaderboard/public/badge] Error:", error);

    return NextResponse.json(
      {
        schemaVersion: 1,
        label: "Guardrail Mesh",
        message: "error",
        color: "red"
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
