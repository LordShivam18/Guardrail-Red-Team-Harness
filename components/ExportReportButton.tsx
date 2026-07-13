"use client";

import { useState } from "react";
import { getComplianceEvidenceAction, getExecutiveComplianceReportAction } from "@/app/actions/operator";

type ReportPayload = {
  generatedAt: string;
  provenance: EvidenceProvenance;
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

type EvidenceProvenance = {
  evaluator_version: string;
  dataset_hash: string;
  dataset_id?: string;
  timestamp_iso: string;
  model_runtime_config: {
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
};

type EvidencePack = {
  provenance?: EvidenceProvenance;
  frameworks: {
    name: string;
    version: string;
    overallStatus: string;
    passCount: number;
    controls: {
      controlId: string;
      status: string;
      observedValue: number | null;
      threshold: number;
      operator: string;
    }[];
  }[];
};

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

function sanitizePdfText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toAsciiHex(value: string) {
  const trimmed = value.trim();

  if (/^[a-f0-9]+$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return Array.from(new TextEncoder().encode(trimmed))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function formatEvidenceNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }

  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

async function loadReportPayload() {
  const response = await getExecutiveComplianceReportAction();
  const payload = response.body as ReportPayload | { error?: string };

  if (response.status >= 400) {
    throw new Error("error" in payload ? payload.error : "Report export failed.");
  }

  return payload as ReportPayload;
}

async function loadEvidencePack(runId: string) {
  try {
    return await getComplianceEvidenceAction(runId);
  } catch {
    console.warn("[report-export] Regulatory mapping evidence was unavailable.");
    return null;
  }
}

async function buildExecutiveCompliancePdf(
  payload: ReportPayload,
  evidencePack: EvidencePack | null
) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    format: "a4",
    orientation: "portrait",
    unit: "pt"
  });
  doc.setFont("helvetica", "normal");

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
    doc.text(sanitizePdfText(title).toUpperCase(), marginX, cursorY);
    cursorY += 10;
    drawDivider(cursorY);
    cursorY += 22;
  };

  const addContentPage = () => {
    doc.addPage();
    cursorY = 44;
  };

  const ensureSpace = (height: number) => {
    if (cursorY + height > pageHeight - 94) {
      addContentPage();
    }
  };

  const drawLabelValue = (label: string, value: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(71, 85, 105);
    doc.text(sanitizePdfText(label).toUpperCase(), labelX, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(value), valueX, cursorY, {
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
    doc.text(sanitizePdfText(title).toUpperCase(), x + 14, y + 22);
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(value), x + 14, y + 49, {
      maxWidth: width - 28
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(sanitizePdfText(detail), x + 14, y + 68, {
      maxWidth: width - 28
    });
  };

  const drawFooter = () => {
    const footerText = `Guardrail Mesh v2.0 | guardrail-red-team-harness.vercel.app | Generated: ${formatTimestamp(
      payload.generatedAt
    )}`;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(footerText), pageWidth / 2, pageHeight - 18, {
      align: "center"
    });
  };

  const drawRegulatoryMapping = () => {
    addContentPage();
    drawSectionTitle("Regulatory Mapping");

    if (!evidencePack || evidencePack.frameworks.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(
        sanitizePdfText("Regulatory evidence was not available for this run."),
        marginX,
        cursorY
      );
      cursorY += 24;
      return;
    }

    const controlX = marginX;
    const statusX = marginX + 130;
    const observedX = marginX + 232;
    const thresholdX = marginX + 342;

    for (const framework of evidencePack.frameworks) {
      ensureSpace(86);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(
        sanitizePdfText(`${framework.name} v${framework.version} - ${framework.overallStatus}`),
        marginX,
        cursorY
      );
      cursorY += 18;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, cursorY - 10, contentWidth, 24, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(sanitizePdfText("CONTROL ID"), controlX + 8, cursorY + 5);
      doc.text(sanitizePdfText("STATUS"), statusX, cursorY + 5);
      doc.text(sanitizePdfText("OBSERVED"), observedX, cursorY + 5);
      doc.text(sanitizePdfText("THRESHOLD"), thresholdX, cursorY + 5);
      cursorY += 26;

      for (const control of framework.controls) {
        ensureSpace(24);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePdfText(control.controlId), controlX + 8, cursorY, {
          maxWidth: 104
        });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(control.status === "FAIL" ? 185 : 15, 23, 42);
        doc.text(sanitizePdfText(control.status), statusX, cursorY, {
          maxWidth: 88
        });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15, 23, 42);
        doc.text(sanitizePdfText(formatEvidenceNumber(control.observedValue)), observedX, cursorY);
        doc.text(
          sanitizePdfText(`${control.operator} ${formatEvidenceNumber(control.threshold)}`),
          thresholdX,
          cursorY,
          { maxWidth: pageWidth - thresholdX - marginX }
        );
        cursorY += 18;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        sanitizePdfText(`${framework.passCount} of ${framework.controls.length} controls passed.`),
        marginX,
        cursorY
      );
      cursorY += 30;
    }
  };

  const matrix = payload.confusionMatrix;
  const modelFileName = sanitizeFileFragment(payload.run.modelVersion || "model");
  const safeCertificateHash = payload.certificateHash
    ? toAsciiHex(payload.certificateHash)
    : null;

  doc.setProperties({
    title: sanitizePdfText("AI Alignment & Vulnerability Audit Report"),
    subject: sanitizePdfText("Executive compliance export"),
    author: sanitizePdfText("Guardrail Automation Mesh")
  });

  doc.setFillColor(2, 6, 23);
  doc.rect(0, 0, pageWidth, 116, "F");
  doc.setTextColor(241, 245, 249);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(sanitizePdfText("AI Alignment & Vulnerability Audit Report"), marginX, cursorY);
  cursorY += 26;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizePdfText(
      "Executive security alignment certificate generated from live dashboard telemetry."
    ),
    marginX,
    cursorY
  );
  cursorY += 20;
  doc.text(sanitizePdfText(`Generated: ${formatTimestamp(payload.generatedAt)}`), marginX, cursorY);

  cursorY = 152;
  drawSectionTitle("Runtime Certificate Context");
  drawLabelValue("Model Version", payload.run.modelVersion);
  drawLabelValue("Run ID", payload.run.id);
  drawLabelValue("Timestamp", formatTimestamp(payload.run.timestamp));
  drawLabelValue("Pipeline Heartbeat", payload.pipelineHeartbeatStatus);
  drawLabelValue(
    "Cryptographic Hash",
    safeCertificateHash
      ? `HASH ${safeCertificateHash}`
      : "Not available"
  );

  drawSectionTitle("Audit Provenance");
  const provenance = evidencePack?.provenance ?? payload.provenance;
  drawLabelValue("Evaluator Version", provenance.evaluator_version);
  drawLabelValue("Dataset ID", provenance.dataset_id ?? "mesh-seed-v1");
  drawLabelValue("Dataset Hash", provenance.dataset_hash);
  drawLabelValue("Provenance Timestamp", formatTimestamp(provenance.timestamp_iso));
  drawLabelValue(
    "Model Runtime Config",
    [
      `temperature=${provenance.model_runtime_config.temperature}`,
      `top_p=${provenance.model_runtime_config.top_p}`,
      `max_tokens=${provenance.model_runtime_config.max_tokens}`
    ].join(", ")
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
    "Compute Exhaustion Delta",
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
    doc.text(
      sanitizePdfText("No OWASP-mapped incidents were recorded for this run."),
      marginX,
      cursorY
    );
    cursorY += 24;
  } else {
    for (const match of payload.owaspRuleMatches) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, cursorY - 15, contentWidth, 30, 6, 6, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(sanitizePdfText(match.rule), ruleX, cursorY + 4, {
        maxWidth: contentWidth - 92
      });
      doc.setFont("helvetica", "bold");
      doc.text(sanitizePdfText(match.count.toLocaleString()), ruleCountX, cursorY + 4, {
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
  const wrappedAttestation = doc
    .splitTextToSize(sanitizePdfText(attestation), contentWidth)
    .map((line: string) => sanitizePdfText(line));
  doc.text(wrappedAttestation, marginX, cursorY);
  cursorY += wrappedAttestation.length * 13 + 12;

  doc.setFillColor(6, 78, 59);
  doc.roundedRect(marginX, pageHeight - 76, contentWidth, 34, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(236, 253, 245);
  doc.text(
    sanitizePdfText("Certified by Guardrail Automation Mesh."),
    pageWidth / 2,
    pageHeight - 54,
    {
      align: "center"
    }
  );
  drawFooter();
  drawRegulatoryMapping();
  drawFooter();

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
      const evidencePack = await loadEvidencePack(payload.run.id);
      await buildExecutiveCompliancePdf(payload, evidencePack);
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
        className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 font-mono text-sm font-semibold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isExporting}
        onClick={handleExport}
        type="button"
      >
        {isExporting ? "Preparing PDF..." : "Export Compliance PDF"}
      </button>
      {errorMessage ? (
        <p className="max-w-xs font-mono text-xs leading-5 text-red-500">{errorMessage}</p>
      ) : null}
    </div>
  );
}
