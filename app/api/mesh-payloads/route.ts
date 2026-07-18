import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MeshPayloadRow = {
  id: string;
  payload_text: string;
  vector_category: string;
  mitre_atlas_id: string | null;
  owasp_llm_id: string | null;
  success_rate_historical: number;
  severity: string;
};

type MeshCoverageGroupRow = {
  owasp_llm_id: string;
  severity: string;
  count: number;
};

function isOwaspSeverityGroup(groupBy: string | null) {
  if (!groupBy) {
    return false;
  }

  const fields = groupBy
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);

  return fields.length === 2 && fields[0] === "owasp" && fields[1] === "severity";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    if (isOwaspSeverityGroup(searchParams.get("group_by"))) {
      const groups = (await sql`
        select
          upper(trim(owasp_llm_id)) as owasp_llm_id,
          lower(trim(severity)) as severity,
          count(*)::int as count
        from mesh_zero_days
        where upper(trim(coalesce(owasp_llm_id, ''))) ~ '^LLM[0-9]{2}$'
          and lower(trim(coalesce(severity, ''))) in ('critical', 'high', 'medium', 'low')
        group by upper(trim(owasp_llm_id)), lower(trim(severity))
        order by upper(trim(owasp_llm_id)) asc, lower(trim(severity)) asc
      `) as MeshCoverageGroupRow[];

      return NextResponse.json({
        group_by: ["owasp", "severity"],
        groups,
        count: groups.length
      });
    }

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
