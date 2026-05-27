"use client";

import { useState } from "react";

type ReportPayload = {
  generatedAt: string;
  pipelineHeartbeatStatus: string;
  run: {
    id: string;
    timestamp: string;
    modelVersion: string;
  };
  metrics: {
    totalInteractions: number;
    jailbreakRate: number;
    falsePositiveRate: number;
    safetySharpe: number | null;
    maxComputeShift: number | null;
  };
  certificateHash: string | null;
  confusionMatrix: {
    truePositive: number;
    falseNegative: number;
    falsePositive: number;
    trueNegative: number;
  };
  owaspRuleMatches: {
    rule: string;
    count: number;
  }[];
};

const REPORT_ENDPOINT = "/api/reports/executive-compliance";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function sanitizeFileFragment(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function loadReportPayload() {
  const response = await fetch(REPORT_ENDPOINT, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as ReportPayload | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : "Report export failed.");
  }

  return payload as ReportPayload;
}

async function buildExecutiveCompliancePdf(payload: ReportPayload) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    format: "a4",
    orientation: "portrait",
    unit: "pt"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const contentWidth = pageWidth - marginX * 2;
  const labelX = marginX;
  const valueX = marginX + 215;
  const ruleX = marginX + 22;
  const ruleCountX = pageWidth - marginX - 42;
  const sectionGap = 28;
  const rowGap = 22;
  let cursorY = 44;

  const drawDivider = (y: number) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.8);
    doc.line(marginX, y, pageWidth - marginX, y);
  };

  const drawSectionTitle = (title: string) => {
    cursorY += sectionGap;
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title.toUpperCase(), marginX, cursorY);
    cursorY += 10;
    drawDivider(cursorY);
    cursorY += 22;
  };

  const drawLabelValue = (label: string, value: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(label.toUpperCase(), labelX, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(value, valueX, cursorY, {
      maxWidth: pageWidth - valueX - marginX
    });
    cursorY += rowGap;
  };

  const drawMetricCard = (
    x: number,
    y: number,
    width: number,
    title: string,
    value: string,
    detail: string
  ) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, width, 84, 7, 7, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(title.toUpperCase(), x + 14, y + 22);
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text(value, x + 14, y + 49, {
      maxWidth: width - 28
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(detail, x + 14, y + 68, {
      maxWidth: width - 28
    });
  };

  const matrix = payload.confusionMatrix;
  const modelFileName = sanitizeFileFragment(payload.run.modelVersion || "model");

  doc.setProperties({
    title: "AI Alignment & Vulnerability Audit Report",
    subject: "Executive compliance export",
    author: "Guardrail Automation Mesh"
  });

  doc.setFillColor(2, 6, 23);
  doc.rect(0, 0, pageWidth, 116, "F");
  doc.setTextColor(241, 245, 249);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("AI Alignment & Vulnerability Audit Report", marginX, cursorY);
  cursorY += 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text("Executive security alignment certificate generated from live dashboard telemetry.", marginX, cursorY);
  cursorY += 20;
  doc.text(`Generated: ${formatTimestamp(payload.generatedAt)}`, marginX, cursorY);

  cursorY = 152;
  drawSectionTitle("Runtime Certificate Context");
  drawLabelValue("Model Version", payload.run.modelVersion);
  drawLabelValue("Run Identifier", payload.run.id);
  drawLabelValue("Run Timestamp", formatTimestamp(payload.run.timestamp));
  drawLabelValue("Pipeline Heartbeat", payload.pipelineHeartbeatStatus);
  drawLabelValue(
    "Cryptographic Hash",
    payload.certificateHash
      ? `\uD83D\uDD12 ${payload.certificateHash}`
      : "Not available"
  );

  drawSectionTitle("Executive Metrics");
  const cardGap = 12;
  const cardWidth = (contentWidth - cardGap * 2) / 3;
  drawMetricCard(
    marginX,
    cursorY,
    cardWidth,
    "Total Interactions",
    payload.metrics.totalInteractions.toLocaleString(),
    "All evaluated attack and safe prompts"
  );
  drawMetricCard(
    marginX + cardWidth + cardGap,
    cursorY,
    cardWidth,
    "Jailbreak Failure",
    formatPercent(payload.metrics.jailbreakRate),
    "Refusal-expected attempts allowed"
  );
  drawMetricCard(
    marginX + (cardWidth + cardGap) * 2,
    cursorY,
    cardWidth,
    "False Positive",
    formatPercent(payload.metrics.falsePositiveRate),
    "Safe prompts blocked by mistake"
  );
  cursorY += 106;

  const advancedCardWidth = (contentWidth - cardGap) / 2;
  drawMetricCard(
    marginX,
    cursorY,
    advancedCardWidth,
    "Safety Sharpe Ratio (SSR)",
    payload.metrics.safetySharpe != null
      ? payload.metrics.safetySharpe.toFixed(3)
      : "N/A",
    "Risk-adjusted safety performance metric."
  );
  drawMetricCard(
    marginX + advancedCardWidth + cardGap,
    cursorY,
    advancedCardWidth,
    "Compute Exhaustion (\u0394C)",
    payload.metrics.maxComputeShift != null
      ? payload.metrics.maxComputeShift.toFixed(3)
      : "N/A",
    "Maximum delta shift in compute resources (Potential DoS threshold)."
  );
  cursorY += 106;

  drawSectionTitle("Confusion Matrix Coordinates");
  const matrixCardWidth = (contentWidth - cardGap) / 2;
  drawMetricCard(
    marginX,
    cursorY,
    matrixCardWidth,
    "True Positive",
    matrix.truePositive.toLocaleString(),
    "Attack prompt correctly blocked"
  );
  drawMetricCard(
    marginX + matrixCardWidth + cardGap,
    cursorY,
    matrixCardWidth,
    "False Negative",
    matrix.falseNegative.toLocaleString(),
    "Attack prompt incorrectly allowed"
  );
  cursorY += 96;
  drawMetricCard(
    marginX,
    cursorY,
    matrixCardWidth,
    "False Positive",
    matrix.falsePositive.toLocaleString(),
    "Safe prompt incorrectly blocked"
  );
  drawMetricCard(
    marginX + matrixCardWidth + cardGap,
    cursorY,
    matrixCardWidth,
    "True Negative",
    matrix.trueNegative.toLocaleString(),
    "Safe prompt correctly allowed"
  );
  cursorY += 100;

  drawSectionTitle("OWASP Rule Matches");
  if (payload.owaspRuleMatches.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("No OWASP-mapped incidents were recorded for this run.", marginX, cursorY);
    cursorY += 24;
  } else {
    for (const match of payload.owaspRuleMatches) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, cursorY - 15, contentWidth, 30, 6, 6, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(match.rule, ruleX, cursorY + 4, {
        maxWidth: contentWidth - 92
      });
      doc.setFont("helvetica", "bold");
      doc.text(match.count.toLocaleString(), ruleCountX, cursorY + 4, {
        align: "right"
      });
      cursorY += 38;
    }
  }

  drawSectionTitle("Compliance Attestation");
  const attestation = [
    "This certificate summarizes the current dashboard state for executive review.",
    "It reflects the latest persisted red-team run, its classification matrix, mapped OWASP controls,",
    "and the active automated pipeline heartbeat at export time."
  ].join(" ");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const wrappedAttestation = doc.splitTextToSize(attestation, contentWidth);
  doc.text(wrappedAttestation, marginX, cursorY);

  doc.setFillColor(6, 78, 59);
  doc.roundedRect(marginX, pageHeight - 76, contentWidth, 34, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(236, 253, 245);
  doc.text("Certified by Guardrail Automation Mesh.", pageWidth / 2, pageHeight - 54, {
    align: "center"
  });

  doc.save(`guardrail-compliance-${modelFileName}.pdf`);
}

export function ExportReportButton() {
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExport() {
    setIsExporting(true);
    setErrorMessage(null);

    try {
      const payload = await loadReportPayload();
      await buildExecutiveCompliancePdf(payload);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to export compliance report."
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        aria-busy={isExporting}
        className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-300/40 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/70 hover:bg-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-300/45 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isExporting}
        onClick={handleExport}
        type="button"
      >
        {isExporting ? "Preparing PDF..." : "Export Executive Compliance PDF"}
      </button>
      {errorMessage ? (
        <p className="max-w-xs text-xs leading-5 text-rose-200">{errorMessage}</p>
      ) : null}
    </div>
  );
}
