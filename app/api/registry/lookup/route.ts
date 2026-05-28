import { NextResponse } from "next/server";
import { lookupByCertificateHash } from "@/lib/meshRegistry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get("hash");

  if (!hash || hash.trim().length === 0) {
    return NextResponse.json(
      { found: false, error: "Missing hash parameter." },
      { status: 400 }
    );
  }

  try {
    const entry = await lookupByCertificateHash(hash);

    if (!entry) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      modelVersion: entry.modelVersion,
      meshScore: entry.meshScore,
      tier: entry.tier,
      rank: entry.rank
    });
  } catch (error) {
    console.error("[registry/lookup] Error:", error);
    return NextResponse.json(
      { found: false, error: "Lookup failed." },
      { status: 500 }
    );
  }
}
