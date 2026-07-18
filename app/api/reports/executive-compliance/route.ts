import { NextResponse } from "next/server";
import { getEvidenceProvenance } from "@/lib/complianceEvidence";
import { getLatestRunIncidents, getLatestRunSummary } from "@/lib/redteamDashboard";
import { generateRegulatoryAuditReport } from "@/lib/regulatoryMapper";
import type { IncidentLogRow } from "@/lib/redteamDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type MatrixCounts = {
  truePositive: number;
  falseNegative: number;
  falsePositive: number;
  trueNegative: number;
};

function isActualAttack(incident: IncidentLogRow) {
  return incident.category.toLowerCase() !== "safe";
}

function getConfusionMatrix(incidents: IncidentLogRow[]): MatrixCounts {
  return incidents.reduce(
    (matrix, incident) => {
      const actualAttack = isActualAttack(incident);

      if (incident.outcomeFlag === "FP") {
        matrix.falsePositive += 1;
        return matrix;
      }

      if (incident.outcomeFlag === "FAILED" || incident.outcomeFlag === "FN") {
        matrix.falseNegative += 1;
        return matrix;
      }

      if (actualAttack) {
        matrix.truePositive += 1;
      } else {
        matrix.trueNegative += 1;
      }

      return matrix;
    },
    {
      truePositive: 0,
      falseNegative: 0,
      falsePositive: 0,
      trueNegative: 0
    }
  );
}

function getOwaspRuleMatches(incidents: IncidentLogRow[]) {
  const matches = new Map<string, { rule: string; count: number }>();

  for (const incident of incidents) {
    if (incident.complianceVector.framework !== "OWASP") {
      continue;
    }

    const existing = matches.get(incident.complianceVector.label);

    if (existing) {
      existing.count += 1;
    } else {
      matches.set(incident.complianceVector.label, {
        rule: incident.complianceVector.label,
        count: 1
      });
    }
  }

  return [...matches.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.rule.localeCompare(right.rule);
  });
}

function getRegulatoryAuditRequirements(incidents: IncidentLogRow[]) {
  const requirements = new Map<
    string,
    {
      taxonomy: string;
      affectedIncidents: number;
      euAiActClause: string;
      nistRmfPillar: string;
      isoControl: string;
    }
  >();

  for (const incident of incidents) {
    const tags = getIncidentTaxonomyTags(incident);

    if (!tags.owaspTag && !tags.mitreTag) {
      continue;
    }

    const report = generateRegulatoryAuditReport(tags.owaspTag, tags.mitreTag);
    const taxonomy = [tags.owaspTag, tags.mitreTag].filter(Boolean).join(" / ");
    const key = [
      taxonomy,
      report.euAiActClause,
      report.nistRmfPillar,
      report.isoControl
    ].join("|");
    const existingRequirement = requirements.get(key);

    if (existingRequirement) {
      existingRequirement.affectedIncidents += 1;
    } else {
      requirements.set(key, {
        taxonomy,
        affectedIncidents: 1,
        ...report
      });
    }
  }

  return [...requirements.values()].sort((left, right) => {
    if (right.affectedIncidents !== left.affectedIncidents) {
      return right.affectedIncidents - left.affectedIncidents;
    }

    return left.taxonomy.localeCompare(right.taxonomy);
  });
}

function getIncidentTaxonomyTags(incident: IncidentLogRow) {
  const label = incident.complianceVector.label.toUpperCase();
  const shortLabel = incident.complianceVector.shortLabel.toUpperCase();

  return {
    owaspTag: shortLabel.includes("OWASP LLM06")
      ? "OWASP LLM06"
      : shortLabel.includes("OWASP LLM01")
        ? "OWASP LLM01"
        : "",
    mitreTag: label.includes("AML.T0054") || shortLabel.includes("AML.T0054")
      ? "MITRE AML.T0054"
      : ""
  };
}

export async function GET() {
  try {
    const [summary, incidentLog] = await Promise.all([
      getLatestRunSummary(),
      getLatestRunIncidents()
    ]);

    if (!summary || !incidentLog) {
      return NextResponse.json(
        { error: "No red-team run data is available for export." },
        { status: 404 }
      );
    }

    const generatedAt = new Date().toISOString();

    return NextResponse.json({
      generatedAt,
      provenance: getEvidenceProvenance(generatedAt),
      pipelineHeartbeatStatus: "Pipeline: Automated (Nightly Cron Active)",
      run: {
        id: summary.runId,
        timestamp: summary.timestamp,
        modelVersion: summary.modelVersion
      },
      metrics: {
        totalInteractions: summary.totalTests,
        jailbreakRate: summary.jailbreakRate,
        falsePositiveRate: summary.falsePositiveRate,
        safetySharpe: summary.safetySharpe ?? null,
        maxComputeShift: summary.maxComputeShift ?? null
      },
      certificateHash: summary.certificateHash ?? null,
      confusionMatrix: getConfusionMatrix(incidentLog.incidents),
      owaspRuleMatches: getOwaspRuleMatches(incidentLog.incidents),
      regulatoryAuditRequirements: getRegulatoryAuditRequirements(incidentLog.incidents)
    });
  } catch (error) {
    console.error("[report-export] Failed to build executive compliance payload.");
    console.error(error);

    return NextResponse.json(
      { error: "Unable to prepare the executive compliance report." },
      { status: 500 }
    );
  }
}
