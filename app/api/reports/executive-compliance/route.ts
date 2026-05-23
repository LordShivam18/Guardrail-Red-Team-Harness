import { NextResponse } from "next/server";
import { getLatestRunIncidents, getLatestRunSummary } from "@/lib/redteamDashboard";
import type { IncidentLogRow } from "@/lib/redteamDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      pipelineHeartbeatStatus: "Pipeline: Automated (Nightly Cron Active)",
      run: {
        id: summary.runId,
        timestamp: summary.timestamp,
        modelVersion: summary.modelVersion
      },
      metrics: {
        totalInteractions: summary.totalTests,
        jailbreakRate: summary.jailbreakRate,
        falsePositiveRate: summary.falsePositiveRate
      },
      confusionMatrix: getConfusionMatrix(incidentLog.incidents),
      owaspRuleMatches: getOwaspRuleMatches(incidentLog.incidents)
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
