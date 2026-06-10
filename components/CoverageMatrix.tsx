"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "critical" | "high" | "medium" | "low";

type CoverageGroup = {
  owasp_llm_id: string;
  severity: Severity;
  count: number;
};

type CoverageResponse = {
  groups?: CoverageGroup[];
  error?: string;
};

const OWASP_ROWS = [
  { id: "LLM01", label: "Prompt Injection" },
  { id: "LLM02", label: "Insecure Output Handling" },
  { id: "LLM03", label: "Training Data Poisoning" },
  { id: "LLM04", label: "Model Denial of Service" },
  { id: "LLM05", label: "Supply Chain Vulnerabilities" },
  { id: "LLM06", label: "Sensitive Information Disclosure" },
  { id: "LLM07", label: "Insecure Plugin Design" },
  { id: "LLM08", label: "Excessive Agency" },
  { id: "LLM09", label: "Overreliance" },
  { id: "LLM10", label: "Model Theft" }
] as const;

const SEVERITIES: { id: Severity; label: string }[] = [
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" }
];

function cellTone(count: number) {
  if (count === 0) {
    return "border-red-900/70 bg-red-950/20 text-red-300";
  }

  if (count < 5) {
    return "border-amber-800/70 bg-amber-950/20 text-amber-200";
  }

  return "border-emerald-800/70 bg-emerald-950/20 text-emerald-200";
}

export function CoverageMatrix() {
  const [groups, setGroups] = useState<CoverageGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCoverage() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/mesh-payloads?group_by=owasp,severity", {
          signal: controller.signal
        });
        const payload = (await response.json()) as CoverageResponse;

        if (!response.ok || payload.error) {
          throw new Error(payload.error ?? "Coverage request failed.");
        }

        setGroups(payload.groups ?? []);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setError(err instanceof Error ? err.message : "Coverage request failed.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    loadCoverage();

    return () => controller.abort();
  }, []);

  const coverageByCell = useMemo(() => {
    const map = new Map<string, number>();

    for (const group of groups) {
      map.set(`${group.owasp_llm_id.toUpperCase()}:${group.severity}`, group.count);
    }

    return map;
  }, [groups]);

  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-950">
      <div className="flex flex-col gap-2 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
            Coverage
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            OWASP Severity Matrix
          </h2>
        </div>
        <span className="font-mono text-xs uppercase text-neutral-600">
          LLM01-LLM10
        </span>
      </div>

      {error ? (
        <div className="p-5">
          <div className="border border-red-900/70 bg-red-950/10 p-4">
            <p className="font-mono text-xs font-bold uppercase text-red-300">
              Coverage unavailable
            </p>
            <p className="mt-2 text-sm text-neutral-400">{error}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[48rem] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-600">
                <th className="w-64 px-3 py-3 font-semibold">OWASP LLM</th>
                {SEVERITIES.map((severity) => (
                  <th className="px-3 py-3 text-center font-semibold" key={severity.id}>
                    {severity.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OWASP_ROWS.map((row) => (
                <tr className="border-b border-neutral-900" key={row.id}>
                  <th className="px-3 py-3 text-left align-middle">
                    <span className="block font-mono text-xs font-black text-white">
                      {row.id}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-neutral-500">
                      {row.label}
                    </span>
                  </th>
                  {SEVERITIES.map((severity) => {
                    const count = coverageByCell.get(`${row.id}:${severity.id}`) ?? 0;

                    return (
                      <td className="px-2 py-2 text-center align-middle" key={severity.id}>
                        <span
                          aria-label={`${row.id} ${severity.label}: ${count}`}
                          className={`inline-flex h-10 min-w-16 items-center justify-center border px-3 font-mono text-sm font-black ${cellTone(
                            count
                          )}`}
                        >
                          {isLoading ? "..." : count}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
