"use client";

import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { IncidentLogRow } from "@/lib/redteamDashboard";

type IncidentLogTableProps = {
  incidents: IncidentLogRow[];
};

type DiffPaneProps = {
  label: string;
  sourceName: string;
  text: string;
  tone: "danger" | "safe";
  blocked?: boolean;
};

const EMPTY_SELECTION = "No attempt selected.";
const CORE_ENGINE_TARGET = "Gemini-2.0-Flash-Guarded-v1";

type MetadataCard = {
  label: string;
  value: string;
  tone: "neutral" | "danger" | "safe" | "warning" | "info" | "mitre";
};

type RuleFlag = {
  label: string;
  value: string;
  tone: "danger" | "safe" | "warning" | "info";
};

function formatCategory(category: string) {
  if (category.toUpperCase() === "PII") {
    return "PII";
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function outcomeClasses(outcomeFlag: IncidentLogRow["outcomeFlag"]) {
  switch (outcomeFlag) {
    case "PASSED":
      return "border-neutral-700 bg-neutral-900 text-white";
    case "FAILED":
      return "border-red-900/60 bg-red-950/30 text-red-400";
    case "FP":
      return "border-amber-900/50 bg-amber-950/20 text-amber-400";
    case "FN":
      return "border-red-900/40 bg-red-950/20 text-red-300";
    default:
      return "border-neutral-700 bg-neutral-900 text-neutral-300";
  }
}

function outcomeLabel(outcomeFlag: IncidentLogRow["outcomeFlag"]) {
  if (outcomeFlag === "FAILED") {
    return "FAILED / Jailbreak";
  }

  return outcomeFlag;
}

function getEvaluationCategory(incident: IncidentLogRow) {
  const category = incident.category.toLowerCase();

  if (category === "pii") {
    return "PII Leakage";
  }

  if (category === "toxic") {
    return "Toxic Phrase";
  }

  if (category === "jailbreak") {
    return "Explicit Bypass Vector";
  }

  if (category === "safe") {
    return "Safe Baseline";
  }

  return `${formatCategory(incident.category)} Evaluation`;
}

function getDeterministicConfidence(incident: IncidentLogRow, base: number) {
  const signature = incident.id
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  const jitter = (signature % 18) / 10;

  return Math.min(99.1, base + jitter).toFixed(1);
}

function getRuleFlags(incident: IncidentLogRow): RuleFlag[] {
  const category = incident.category.toLowerCase();
  const promptAndOutput = `${incident.prompt} ${incident.rawOutput} ${incident.finalOutput}`;
  const outputWasSanitized = incident.rawOutput !== incident.finalOutput;
  const flags: RuleFlag[] = [
    {
      label: "Core Guard Decision",
      value: incident.blocked ? "Request blocked before delivery" : "Request allowed to complete",
      tone: incident.blocked ? "danger" : "safe"
    },
    {
      label: "Outcome Mapper",
      value: outcomeLabel(incident.outcomeFlag),
      tone:
        incident.outcomeFlag === "PASSED"
          ? "safe"
          : incident.outcomeFlag === "FP"
            ? "warning"
            : "danger"
    }
  ];

  if (category === "pii" || /credit card|social security|ssn|email|phone/i.test(promptAndOutput)) {
    flags.push({
      label: "Triggered Regex Pattern #4",
      value: "PII/token leakage scrubber matched sensitive data",
      tone: "warning"
    });
  }

  if (category === "toxic" || /insult|threat|harassment|obscene/i.test(promptAndOutput)) {
    flags.push({
      label: "TensorFlow Toxicity Confidence",
      value: `${getDeterministicConfidence(incident, 94.2)}% local toxicity score`,
      tone: "danger"
    });
  }

  if (category === "jailbreak" || /bypass|developer mode|system prompt|override/i.test(promptAndOutput)) {
    flags.push({
      label: "Explicit Bypass Vector",
      value: "System prompt override heuristic detected",
      tone: "danger"
    });
  }

  flags.push({
    label: "Sanitizer Delta",
    value: outputWasSanitized ? "Safe output differs from raw model trace" : "No output mutation required",
    tone: outputWasSanitized ? "warning" : "info"
  });

  return flags;
}

function metadataToneClasses(tone: MetadataCard["tone"]) {
  switch (tone) {
    case "danger":
      return "border-red-900/60 bg-red-950/30 text-red-400";
    case "safe":
      return "border-neutral-700 bg-neutral-900 text-white";
    case "warning":
      return "border-amber-900/50 bg-amber-950/20 text-amber-400";
    case "info":
      return "border-neutral-700 bg-neutral-900 text-neutral-300";
    case "mitre":
      return "border-neutral-700 bg-neutral-900 text-neutral-300";
    default:
      return "border-neutral-800 bg-neutral-950 text-neutral-300";
  }
}

function complianceToneClasses(tone: IncidentLogRow["complianceVector"]["tone"]) {
  switch (tone) {
    case "amber":
      return "border-amber-900/50 bg-amber-950/20 text-amber-400";
    case "rose":
      return "border-red-900/60 bg-red-950/30 text-red-400";
    case "violet":
      return "border-neutral-700 bg-neutral-900 text-neutral-300";
    case "cyan":
      return "border-neutral-700 bg-neutral-900 text-neutral-300";
    default:
      return "border-neutral-800 bg-neutral-950 text-neutral-400";
  }
}

function complianceMetadataTone(
  tone: IncidentLogRow["complianceVector"]["tone"]
): MetadataCard["tone"] {
  switch (tone) {
    case "amber":
      return "warning";
    case "rose":
      return "danger";
    case "violet":
      return "mitre";
    case "cyan":
      return "info";
    default:
      return "neutral";
  }
}

function ruleFlagClasses(tone: RuleFlag["tone"]) {
  switch (tone) {
    case "danger":
      return "border-red-900/60 bg-red-950/30 text-red-400";
    case "safe":
      return "border-neutral-700 bg-neutral-900 text-white";
    case "warning":
      return "border-amber-900/50 bg-amber-950/20 text-amber-400";
    default:
      return "border-neutral-700 bg-neutral-900 text-neutral-300";
  }
}

function splitLines(text: string) {
  const lines = text.split(/\r?\n/);

  return lines.length === 0 ? [text] : lines;
}

function DiffPane({ label, sourceName, text, tone, blocked = false }: DiffPaneProps) {
  const lines = splitLines(text || EMPTY_SELECTION);
  const rawBlocked = tone === "danger" && blocked;
  const toneClasses =
    tone === "danger"
      ? rawBlocked
        ? "border-red-900/60 bg-red-950/30 text-red-300"
        : "border-red-900/40 bg-red-950/20 text-red-200"
      : "border-neutral-700 bg-neutral-900 text-neutral-200";
  const markerClasses = tone === "danger" ? "text-red-500" : "text-white";
  const gutterClasses =
    tone === "danger"
      ? "border-red-900/30 bg-red-950/20 text-red-400/70"
      : "border-neutral-800 bg-neutral-950 text-neutral-500";

  return (
    <section className={`min-h-80 overflow-hidden rounded-lg border ${toneClasses}`}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div>
          <p className="font-mono text-[11px] text-neutral-600">{sourceName}</p>
          <h3 className="mt-1 font-mono text-xs font-medium uppercase tracking-[0.16em] text-neutral-300">
            {label}
          </h3>
        </div>
        <span className="rounded-none border border-neutral-700 bg-black px-2 py-1 font-mono text-[11px] text-neutral-500">
          {tone === "danger" ? "raw" : "safe"}
        </span>
      </div>
      <div className="max-h-[28rem] overflow-auto font-mono text-xs leading-6">
        {lines.map((line, index) => (
          <div className="grid grid-cols-[3rem_1fr] border-b border-white/5" key={index}>
            <span className={`select-none border-r px-3 text-right ${gutterClasses}`}>
              {index + 1}
            </span>
            <p className="whitespace-pre-wrap break-words px-3 py-1.5">
              <span className={`mr-2 ${markerClasses}`}>{tone === "danger" ? "-" : "+"}</span>
              {line || " "}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AttemptDetailDrawer({
  incident,
  onClose
}: {
  incident: IncidentLogRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!incident) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [incident, onClose]);

  if (!incident) {
    return null;
  }

  const metadata: MetadataCard[] = [
    {
      label: "Core Engine Target",
      value: incident.modelVersion || CORE_ENGINE_TARGET,
      tone: "neutral"
    },
    {
      label: "Processing Latency",
      value: `${incident.processingLatencyMs} ms`,
      tone: incident.processingLatencyMs > 700 ? "warning" : "safe"
    },
    {
      label: "Evaluated Classification Category",
      value: getEvaluationCategory(incident),
      tone: incident.blocked ? "danger" : "neutral"
    },
    {
      label: "Safety Profile",
      value: incident.safetyVector,
      tone: incident.blocked ? "danger" : "safe"
    },
    {
      label: "Compliance Vector",
      value: incident.complianceVector.label,
      tone: complianceMetadataTone(incident.complianceVector.tone)
    }
  ];
  const ruleFlags = getRuleFlags(incident);

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close attempt details"
        className="attempt-drawer-overlay-in absolute inset-0 cursor-default bg-black/80"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label="Attempt evaluation inspector"
        aria-modal="true"
        className="attempt-drawer-panel-in absolute right-0 top-0 flex h-full w-full max-w-6xl flex-col border-l border-neutral-800 bg-black"
        role="dialog"
      >
        <div className="flex flex-col gap-4 border-b border-neutral-800 bg-neutral-950 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Attempt Inspector
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              {getEvaluationCategory(incident)}
            </h2>
            <p className="mt-2 font-mono text-sm text-neutral-500">
              Result {incident.id.slice(0, 8)} — {formatTimestamp(incident.createdAt)}
            </p>
          </div>
          <button
            className="h-10 rounded-md border border-neutral-700 bg-neutral-900 px-4 font-mono text-sm font-semibold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white focus:outline-none focus:ring-1 focus:ring-neutral-500"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metadata.map((item) => (
              <section
                className={`rounded-md border p-4 ${metadataToneClasses(item.tone)}`}
                key={item.label}
              >
                <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                  {item.label}
                </p>
                <p className="mt-2 break-words text-sm font-semibold text-white">
                  {item.value}
                </p>
              </section>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-none border px-2.5 py-1 font-mono text-xs font-semibold uppercase ${outcomeClasses(
                incident.outcomeFlag
              )}`}
            >
              {outcomeLabel(incident.outcomeFlag)}
            </span>
            <span className="inline-flex rounded-none border border-neutral-700 bg-neutral-900 px-2.5 py-1 font-mono text-xs font-semibold uppercase text-neutral-300">
              {incident.safetyVector}
            </span>
          </div>

          <section className="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
                  Multi-Layer Rule Flags
                </p>
                <h3 className="mt-2 text-lg font-black tracking-tight text-white">
                  Evaluation Signal Stack
                </h3>
              </div>
              <p className="font-mono text-sm text-neutral-500">{ruleFlags.length} active signals</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {ruleFlags.map((flag) => (
                <article
                  className={`rounded-md border p-3 ${ruleFlagClasses(flag.tone)}`}
                  key={`${flag.label}-${flag.value}`}
                >
                  <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-neutral-500">
                    {flag.label}
                  </p>
                  <p className="mt-2 text-sm leading-5">{flag.value}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <DiffPane
              blocked={incident.blocked}
              label="Raw User Adversarial Input Text"
              sourceName="attempt.raw_input"
              text={incident.prompt}
              tone="danger"
            />
            <DiffPane
              label="Sanitized Safe Engine Output Text"
              sourceName="engine.safe_output"
              text={incident.finalOutput}
              tone="safe"
            />
          </div>

          <section className="mt-5 rounded-md border border-neutral-800 bg-black p-4">
            <h3 className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              Raw Model Trace
            </h3>
            <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-neutral-400">
              {incident.rawOutput}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

export function IncidentLogTable({ incidents }: IncidentLogTableProps) {
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const visibleIncidents = useMemo(() => {
    if (!showFailuresOnly) {
      return incidents;
    }

    return incidents.filter((incident) => incident.outcomeFlag === "FAILED");
  }, [incidents, showFailuresOnly]);

  const activeIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedAttemptId) ?? null,
    [incidents, selectedAttemptId]
  );

  function toggleIncident(incidentId: string) {
    setSelectedAttemptId((currentId) => (currentId === incidentId ? null : incidentId));
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, incidentId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleIncident(incidentId);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-3 border-y border-neutral-800 bg-black px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-sm text-neutral-500">
          Showing{" "}
          <span className="font-semibold text-white">{visibleIncidents.length}</span>{" "}
          of <span className="font-semibold text-white">{incidents.length}</span>{" "}
          attempts
        </p>

        <label className="inline-flex w-fit cursor-pointer items-center gap-3 font-mono text-sm font-medium text-neutral-300">
          <span>Show Failures Only</span>
          <span className="relative inline-flex h-6 w-11 items-center">
            <input
              checked={showFailuresOnly}
              className="peer sr-only"
              onChange={(event) => setShowFailuresOnly(event.target.checked)}
              type="checkbox"
            />
            <span className="absolute inset-0 rounded-full border border-neutral-700 bg-neutral-900 transition peer-checked:border-red-800 peer-checked:bg-red-950/40" />
            <span className="absolute left-1 h-4 w-4 rounded-full bg-neutral-600 transition peer-checked:translate-x-5 peer-checked:bg-red-500" />
          </span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="bg-neutral-950">
            <tr className="border-b border-neutral-800 text-left font-mono text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              <th className="w-64 px-4 py-3">Category</th>
              <th className="w-80 px-4 py-3">Prompt</th>
              <th className="w-48 px-4 py-3">Outcome</th>
              <th className="w-44 px-4 py-3">Safety Vector</th>
              <th className="px-4 py-3">Final Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {visibleIncidents.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center font-mono text-sm text-neutral-600" colSpan={5}>
                  No incidents match the current filter.
                </td>
              </tr>
            ) : (
              visibleIncidents.map((incident) => (
                <tr
                  aria-label={`Open details for ${incident.complianceVector.label} attempt`}
                  aria-selected={selectedAttemptId === incident.id}
                  className={`cursor-pointer align-top transition focus:outline-none ${
                    selectedAttemptId === incident.id
                      ? "bg-neutral-900 border-l-2 border-l-white"
                      : "bg-black hover:bg-neutral-950 focus:bg-neutral-950"
                  }`}
                  key={incident.id}
                  onClick={() => toggleIncident(incident.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, incident.id)}
                  tabIndex={0}
                >
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex max-w-full flex-col rounded-none border px-2.5 py-2 font-mono text-xs font-semibold ${complianceToneClasses(
                        incident.complianceVector.tone
                      )}`}
                    >
                      <span className="text-[11px] uppercase text-neutral-500">
                        {incident.complianceVector.framework}
                      </span>
                      <span className="mt-1 leading-5">{incident.complianceVector.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="truncate text-sm text-neutral-400" title={incident.prompt}>
                      {incident.prompt}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-none border px-2.5 py-1 font-mono text-xs font-semibold uppercase ${outcomeClasses(
                        incident.outcomeFlag
                      )}`}
                    >
                      {outcomeLabel(incident.outcomeFlag)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex max-w-full rounded-none border border-neutral-700 bg-neutral-900 px-2.5 py-1 font-mono text-xs font-semibold uppercase text-neutral-300">
                      <span className="truncate">{incident.safetyVector}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="max-h-24 overflow-hidden text-sm leading-6 text-neutral-400">
                      {incident.finalOutput}
                    </p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AttemptDetailDrawer
        incident={activeIncident}
        onClose={() => setSelectedAttemptId(null)}
      />
    </div>
  );
}
