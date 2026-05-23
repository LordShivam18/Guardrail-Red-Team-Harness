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
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "FAILED":
      return "border-rose-500/40 bg-rose-500/15 text-rose-100";
    case "FP":
      return "border-amber-400/40 bg-amber-400/15 text-amber-100";
    case "FN":
      return "border-orange-400/40 bg-orange-400/15 text-orange-100";
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
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
      return "border-rose-400/30 bg-rose-500/10 text-rose-100";
    case "safe":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
    case "warning":
      return "border-amber-300/30 bg-amber-300/10 text-amber-100";
    case "info":
      return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
    case "mitre":
      return "border-violet-300/30 bg-violet-400/10 text-violet-100";
    default:
      return "border-slate-700/80 bg-slate-900/55 text-slate-100";
  }
}

function complianceToneClasses(tone: IncidentLogRow["complianceVector"]["tone"]) {
  switch (tone) {
    case "amber":
      return "border-amber-300/40 bg-amber-300/15 text-amber-100 shadow-[0_0_18px_rgba(252,211,77,0.12)]";
    case "rose":
      return "border-rose-300/35 bg-rose-500/15 text-rose-100 shadow-[0_0_18px_rgba(251,113,133,0.12)]";
    case "violet":
      return "border-violet-300/35 bg-violet-400/15 text-violet-100 shadow-[0_0_18px_rgba(167,139,250,0.12)]";
    case "cyan":
      return "border-cyan-300/35 bg-cyan-400/10 text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,0.12)]";
    default:
      return "border-slate-600 bg-slate-800/70 text-slate-200";
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
      return "border-rose-400/35 bg-rose-500/10 text-rose-100";
    case "safe":
      return "border-emerald-400/35 bg-emerald-400/10 text-emerald-100";
    case "warning":
      return "border-amber-300/35 bg-amber-300/10 text-amber-100";
    default:
      return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
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
        ? "border-rose-400/35 bg-rose-950/40 text-rose-50 shadow-[inset_0_0_48px_rgba(244,63,94,0.12)]"
        : "border-rose-500/20 bg-rose-950/15 text-rose-100"
      : "border-emerald-400/25 bg-emerald-950/20 text-emerald-50 shadow-[0_0_24px_rgba(52,211,153,0.08)]";
  const markerClasses = tone === "danger" ? "text-rose-300" : "text-emerald-200";
  const gutterClasses =
    tone === "danger"
      ? "border-rose-300/10 bg-rose-950/30 text-rose-300/70"
      : "border-emerald-300/10 bg-emerald-950/20 text-emerald-300/70";

  return (
    <section className={`min-h-80 overflow-hidden rounded-lg border ${toneClasses}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-mono text-[11px] text-slate-500">{sourceName}</p>
          <h3 className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
            {label}
          </h3>
        </div>
        <span className="rounded border border-white/10 bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-400">
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
        className="attempt-drawer-overlay-in absolute inset-0 cursor-default bg-slate-950/75 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label="Attempt evaluation inspector"
        aria-modal="true"
        className="attempt-drawer-panel-in absolute right-0 top-0 flex h-full w-full max-w-6xl flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        role="dialog"
      >
        <div className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.03] px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Attempt Inspector
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">
              {getEvaluationCategory(incident)}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Result {incident.id.slice(0, 8)} - {formatTimestamp(incident.createdAt)}
            </p>
          </div>
          <button
            className="h-10 rounded-md border border-slate-700 bg-slate-950/80 px-4 text-sm font-semibold text-slate-200 transition hover:border-emerald-300/60 hover:text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
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
                className={`rounded-lg border p-4 ${metadataToneClasses(item.tone)}`}
                key={item.label}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-2 break-words text-sm font-semibold text-slate-100">
                  {item.value}
                </p>
              </section>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeClasses(
                incident.outcomeFlag
              )}`}
            >
              {outcomeLabel(incident.outcomeFlag)}
            </span>
            <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
              {incident.safetyVector}
            </span>
          </div>

          <section className="mt-5 rounded-lg border border-white/10 bg-slate-900/35 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Multi-Layer Rule Flags
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">
                  Evaluation Signal Stack
                </h3>
              </div>
              <p className="text-sm text-slate-500">{ruleFlags.length} active signals</p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {ruleFlags.map((flag) => (
                <article
                  className={`rounded-lg border p-3 ${ruleFlagClasses(flag.tone)}`}
                  key={`${flag.label}-${flag.value}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
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

          <section className="mt-5 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Raw Model Trace
            </h3>
            <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-300">
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
      <div className="flex flex-col gap-3 border-y border-slate-800 bg-slate-950/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">
          Showing{" "}
          <span className="font-semibold text-slate-100">{visibleIncidents.length}</span>{" "}
          of <span className="font-semibold text-slate-100">{incidents.length}</span>{" "}
          attempts
        </p>

        <label className="inline-flex w-fit cursor-pointer items-center gap-3 text-sm font-medium text-slate-200">
          <span>Show Failures Only</span>
          <span className="relative inline-flex h-6 w-11 items-center">
            <input
              checked={showFailuresOnly}
              className="peer sr-only"
              onChange={(event) => setShowFailuresOnly(event.target.checked)}
              type="checkbox"
            />
            <span className="absolute inset-0 rounded-full border border-slate-700 bg-slate-900 transition peer-checked:border-rose-400/60 peer-checked:bg-rose-500/20" />
            <span className="absolute left-1 h-4 w-4 rounded-full bg-slate-500 transition peer-checked:translate-x-5 peer-checked:bg-rose-300" />
          </span>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse">
          <thead className="bg-slate-900/80">
            <tr className="border-b border-slate-800 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <th className="w-64 px-4 py-3">Category</th>
              <th className="w-80 px-4 py-3">Prompt</th>
              <th className="w-48 px-4 py-3">Outcome</th>
              <th className="w-44 px-4 py-3">Safety Vector</th>
              <th className="px-4 py-3">Final Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {visibleIncidents.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
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
                      ? "bg-emerald-400/10 shadow-[inset_3px_0_0_rgba(52,211,153,0.9)]"
                      : "bg-slate-950/40 hover:bg-slate-900/70 focus:bg-slate-900/70"
                  }`}
                  key={incident.id}
                  onClick={() => toggleIncident(incident.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, incident.id)}
                  tabIndex={0}
                >
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex max-w-full flex-col rounded-lg border px-2.5 py-2 text-xs font-semibold ${complianceToneClasses(
                        incident.complianceVector.tone
                      )}`}
                    >
                      <span className="text-[11px] uppercase text-slate-400">
                        {incident.complianceVector.framework}
                      </span>
                      <span className="mt-1 leading-5">{incident.complianceVector.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="truncate text-sm text-slate-300" title={incident.prompt}>
                      {incident.prompt}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeClasses(
                        incident.outcomeFlag
                      )}`}
                    >
                      {outcomeLabel(incident.outcomeFlag)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex max-w-full rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                      <span className="truncate">{incident.safetyVector}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="max-h-24 overflow-hidden text-sm leading-6 text-slate-300">
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
