"use client";

import { useMemo, useState } from "react";
import type { IncidentLogRow } from "@/lib/redteamDashboard";

type IncidentLogTableProps = {
  incidents: IncidentLogRow[];
};

function formatCategory(category: string) {
  if (category.toUpperCase() === "PII") {
    return "PII";
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
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

export function IncidentLogTable({ incidents }: IncidentLogTableProps) {
  const [showFailuresOnly, setShowFailuresOnly] = useState(false);

  const visibleIncidents = useMemo(() => {
    if (!showFailuresOnly) {
      return incidents;
    }

    return incidents.filter((incident) => incident.outcomeFlag === "FAILED");
  }, [incidents, showFailuresOnly]);

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
              <th className="w-36 px-4 py-3">Category</th>
              <th className="w-80 px-4 py-3">Prompt</th>
              <th className="w-48 px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Final Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {visibleIncidents.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={4}>
                  No incidents match the current filter.
                </td>
              </tr>
            ) : (
              visibleIncidents.map((incident) => (
                <tr key={incident.id} className="bg-slate-950/40 align-top">
                  <td className="px-4 py-4">
                    <span className="text-sm font-semibold text-slate-200">
                      {formatCategory(incident.category)}
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
    </div>
  );
}
