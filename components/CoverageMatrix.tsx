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

type Modality = "text" | "tool_call" | "vision" | "rag" | "voice";

type ModalityCoverageGroup = {
  modality: Modality;
  count: number;
};

type ModalityCoverageResponse = {
  groups?: ModalityCoverageGroup[];
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

const MODALITIES: { id: Modality; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "tool_call", label: "Tool call" },
  { id: "vision", label: "Vision" },
  { id: "rag", label: "RAG" },
  { id: "voice", label: "Voice" }
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
  const [modalityGroups, setModalityGroups] = useState<ModalityCoverageGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCoverage() {
      setIsLoading(true);
      setError(null);

      try {
        const [coverageResponse, modalityResponse] = await Promise.all([
          fetch("/api/mesh-payloads?group_by=owasp,severity", {
            signal: controller.signal
          }),
          fetch("/api/coverage/modality", {
            signal: controller.signal
          })
        ]);
        const payload = (await coverageResponse.json()) as CoverageResponse;
        const modalityPayload = (await modalityResponse.json()) as ModalityCoverageResponse;

        if (!coverageResponse.ok || payload.error) {
          throw new Error(payload.error ?? "Coverage request failed.");
        }

        if (!modalityResponse.ok || modalityPayload.error) {
          throw new Error(modalityPayload.error ?? "Modality coverage request failed.");
        }

        setGroups(payload.groups ?? []);
        setModalityGroups(modalityPayload.groups ?? []);
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

  const modalityCounts = useMemo(() => {
    const map = new Map<Modality, number>();

    for (const modality of MODALITIES) {
      map.set(modality.id, 0);
    }

    for (const group of modalityGroups) {
      map.set(group.modality, group.count);
    }

    return map;
  }, [modalityGroups]);

  const maxModalityCount = useMemo(
    () => Math.max(1, ...MODALITIES.map((modality) => modalityCounts.get(modality.id) ?? 0)),
    [modalityCounts]
  );

  function navigateToModality(modality: Modality) {
    window.location.href = `/dashboard?modality=${encodeURIComponent(modality)}#incident-log`;
  }

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

          <div className="mt-6 border-t border-neutral-800 pt-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                  Coverage by modality
                </p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-white">
                  Payload Surface Distribution
                </h3>
              </div>
              <p className="font-mono text-xs uppercase text-neutral-600">
                Click bar to inspect incidents
              </p>
            </div>

            <svg
              aria-label="Coverage by modality bar chart"
              className="mt-4 h-72 w-full min-w-[42rem]"
              role="img"
              viewBox="0 0 760 270"
            >
              <rect fill="#000000" height="270" width="760" x="0" y="0" />
              {MODALITIES.map((modality, index) => {
                const count = modalityCounts.get(modality.id) ?? 0;
                const y = 28 + index * 46;
                const width = count === 0 ? 18 : Math.max(28, (count / maxModalityCount) * 430);
                const fill = count === 0 ? "#dc2626" : "#ffffff";
                const opacity = count === 0 ? 0.4 : 1;

                return (
                  <g
                    aria-label={`${modality.label}: ${count} payloads`}
                    className="cursor-pointer outline-none"
                    key={modality.id}
                    onClick={() => navigateToModality(modality.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigateToModality(modality.id);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                  >
                    <text
                      fill="#a3a3a3"
                      fontFamily="monospace"
                      fontSize="13"
                      fontWeight="700"
                      x="18"
                      y={y + 20}
                    >
                      {modality.label.toUpperCase()}
                    </text>
                    <rect
                      fill={fill}
                      height="24"
                      opacity={opacity}
                      width={width}
                      x="150"
                      y={y}
                    />
                    <rect
                      fill="none"
                      height="24"
                      opacity="0.55"
                      stroke="#ffffff"
                      strokeWidth="1"
                      width="430"
                      x="150"
                      y={y}
                    />
                    <text
                      fill={count === 0 ? "#fca5a5" : "#ffffff"}
                      fontFamily="monospace"
                      fontSize="13"
                      fontWeight="800"
                      x="604"
                      y={y + 18}
                    >
                      {isLoading ? "..." : `${count} payloads`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </section>
  );
}
