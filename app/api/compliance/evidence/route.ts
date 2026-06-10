import { NextResponse } from "next/server";
import { RunNotFoundError, generateEvidencePack } from "@/lib/complianceEvidence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId")?.trim();

  if (!runId) {
    return NextResponse.json({ error: "runId is required." }, { status: 400 });
  }

  try {
    const pack = await generateEvidencePack(runId);
    return NextResponse.json(pack);
  } catch (error) {
    if (error instanceof RunNotFoundError) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    console.error("[compliance:evidence] Failed to generate evidence pack.");
    console.error(error);

    return NextResponse.json(
      { error: "Unable to generate compliance evidence." },
      { status: 500 }
    );
  }
}
