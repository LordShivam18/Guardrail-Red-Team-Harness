import { NextResponse } from "next/server";
import { getParetoFrontierRows } from "@/lib/dashboardVisualData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await getParetoFrontierRows(50);

    return NextResponse.json({
      rows: rows.map((row) => ({
        modelVersion: row.modelVersion,
        jailbreakRate: row.jailbreakRate,
        safetySharpe: row.safetySharpe
      }))
    });
  } catch (error) {
    console.error("[pareto-data] Failed to load Pareto data.");
    console.error(error);

    return NextResponse.json(
      { error: "Unable to load Pareto frontier data." },
      { status: 500 }
    );
  }
}
