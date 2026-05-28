import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type MeshPayloadRow = {
  id: string;
  payload_text: string;
  vector_category: string;
  mitre_atlas_id: string | null;
  owasp_llm_id: string | null;
  success_rate_historical: number;
  severity: string;
};

export async function GET() {
  try {
    const rows = (await sql`
      select
        id,
        payload_text,
        vector_category,
        mitre_atlas_id,
        owasp_llm_id,
        success_rate_historical,
        severity
      from mesh_zero_days
      order by success_rate_historical desc, vector_category asc
    `) as MeshPayloadRow[];

    return NextResponse.json({ payloads: rows, count: rows.length });
  } catch (error) {
    console.error("[api/mesh-payloads] Error:", error);
    return NextResponse.json(
      { payloads: [], count: 0, error: "Failed to fetch Mesh payloads." },
      { status: 500 }
    );
  }
}
