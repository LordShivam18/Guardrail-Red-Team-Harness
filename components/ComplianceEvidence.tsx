"use client";

import { useEffect, useMemo, useState } from "react";
import type { EvidenceFramework, EvidencePack } from "@/lib/complianceEvidence";

type ComplianceEvidenceProps = {
  runId: string;
};

type AnchorResponse = {
  txHash: string;
  network: string;
  certHash: string;
};

const STATUS_CLASS = {
  COMPLIANT: "text-white",
  PARTIAL: "text-amber-400",
  NON_COMPLIANT: "text-red-500"
} as const;

function sanitizeFileFragment(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function formatNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }

  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function downloadFrameworkEvidence(runId: string, framework: EvidenceFramework) {
  const blob = new Blob([JSON.stringify({ runId, framework }, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `compliance-${sanitizeFileFragment(framework.code)}-${runId}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ComplianceEvidence({ runId }: ComplianceEvidenceProps) {
  const [pack, setPack] = useState<EvidencePack | null>(null);
  const [openFrameworks, setOpenFrameworks] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [anchorResult, setAnchorResult] = useState<AnchorResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadEvidence() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/compliance/evidence?runId=${encodeURIComponent(runId)}`,
          {
            headers: {
              Accept: "application/json"
            },
            cache: "no-store"
          }
        );
        const payload = (await response.json()) as EvidencePack | { error?: string };

        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Evidence fetch failed.");
        }

        if (isMounted) {
          const nextPack = payload as EvidencePack;
          setPack(nextPack);
          setOpenFrameworks(new Set(nextPack.frameworks.map((framework) => framework.code)));
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load compliance evidence."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadEvidence();

    return () => {
      isMounted = false;
    };
  }, [runId]);

  const totalControls = useMemo(
    () => pack?.frameworks.reduce((total, framework) => total + framework.controls.length, 0) ?? 0,
    [pack]
  );

  function toggleFramework(code: string) {
    setOpenFrameworks((current) => {
      const next = new Set(current);

      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }

      return next;
    });
  }

  async function handleAnchor() {
    setIsAnchoring(true);
    setAnchorResult(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/compliance/onchain-anchor", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ runId })
      });
      const payload = (await response.json()) as AnchorResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Anchoring failed.");
      }

      setAnchorResult(payload as AnchorResponse);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to anchor compliance certificate."
      );
    } finally {
      setIsAnchoring(false);
    }
  }

  return (
    <section className="border border-neutral-800 bg-black font-mono text-white">
      <div className="flex flex-col gap-2 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
            Regulatory Compliance Engine
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white">
            Evidence Pack
          </h2>
        </div>
        <p className="text-xs uppercase text-neutral-500">
          {isLoading ? "LOADING" : `${totalControls} CONTROLS`}
        </p>
      </div>

      {errorMessage ? (
        <div className="border-b border-red-950 bg-black px-5 py-3 text-xs uppercase text-red-500">
          {errorMessage}
        </div>
      ) : null}

      <div className="divide-y divide-neutral-800">
        {pack?.frameworks.map((framework) => {
          const isOpen = openFrameworks.has(framework.code);

          return (
            <article className="bg-black" key={framework.code}>
              <button
                className="flex w-full flex-col gap-3 bg-black px-5 py-4 text-left transition hover:bg-neutral-950 sm:flex-row sm:items-center sm:justify-between"
                onClick={() => toggleFramework(framework.code)}
                type="button"
              >
                <span className="text-sm font-black uppercase tracking-[0.12em] text-white">
                  {framework.name} v{framework.version}
                </span>
                <span
                  className={`text-xs font-black uppercase ${STATUS_CLASS[framework.overallStatus]}`}
                >
                  [{framework.overallStatus}]
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-neutral-900 bg-black">
                  <div className="overflow-x-auto">
                    <table className="min-w-[920px] w-full border-collapse text-left text-xs">
                      <thead className="border-b border-neutral-800 text-neutral-500">
                        <tr>
                          <th className="px-4 py-3 font-bold uppercase">Control ID</th>
                          <th className="px-4 py-3 font-bold uppercase">Name</th>
                          <th className="px-4 py-3 font-bold uppercase">Metric</th>
                          <th className="px-4 py-3 font-bold uppercase">Threshold</th>
                          <th className="px-4 py-3 font-bold uppercase">Observed</th>
                          <th className="px-4 py-3 font-bold uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {framework.controls.map((control) => (
                          <tr
                            className={`border-b border-neutral-900 ${
                              control.status === "FAIL"
                                ? "border-l-4 border-l-red-500"
                                : control.status === "PASS"
                                  ? "border-l-4 border-l-white"
                                  : "border-l-4 border-l-amber-400"
                            }`}
                            key={control.controlId}
                          >
                            <td className="whitespace-nowrap px-4 py-3 text-white">
                              {control.controlId}
                            </td>
                            <td className="px-4 py-3 text-neutral-300">
                              {control.controlName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-neutral-400">
                              {control.metricField}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-neutral-300">
                              {control.operator} {formatNumber(control.threshold)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-neutral-300">
                              {formatNumber(control.observedValue)}
                            </td>
                            <td
                              className={`whitespace-nowrap px-4 py-3 font-black ${
                                control.status === "FAIL"
                                  ? "text-red-500"
                                  : control.status === "PASS"
                                    ? "text-white"
                                    : "text-amber-400"
                              }`}
                            >
                              {control.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-neutral-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs uppercase text-neutral-500">
                      {framework.passCount} / {framework.controls.length} PASSED
                    </p>
                    <button
                      className="inline-flex h-9 w-fit items-center border border-neutral-700 bg-black px-3 text-xs font-black uppercase text-white transition hover:border-white disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => downloadFrameworkEvidence(runId, framework)}
                      type="button"
                    >
                      [EXPORT JSON]
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        {!pack && isLoading ? (
          <div className="grid min-h-40 place-items-center px-5 py-8 text-xs uppercase text-neutral-500">
            LOADING EVIDENCE
          </div>
        ) : null}
      </div>

      <div className="border-t border-neutral-800 px-5 py-4">
        <button
          className="inline-flex h-10 items-center border border-white bg-white px-4 text-xs font-black uppercase text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isAnchoring || !pack}
          onClick={handleAnchor}
          type="button"
        >
          {isAnchoring ? "[ANCHORING]" : "[ANCHOR ON-CHAIN]"}
        </button>
        {anchorResult ? (
          <pre
            className={`mt-4 overflow-x-auto border border-neutral-800 bg-neutral-950 p-3 text-xs ${
              anchorResult.network === "simulation" ? "text-amber-400" : "text-white"
            }`}
          >
            {anchorResult.network === "simulation" ? "⚠ SIMULATED — " : ""}
            {anchorResult.txHash}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
