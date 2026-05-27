import { Suspense } from "react";
import { ExportReportButton } from "@/components/ExportReportButton";
import { HistoricalTrend } from "@/components/HistoricalTrend";
import { IncidentLog } from "@/components/IncidentLog";
import { RefreshButton } from "@/components/RefreshButton";
import { RunSummary } from "@/components/RunSummary";
import { getLatestRunSummary } from "@/lib/redteamDashboard";

async function CertificateBadge() {
  const summary = await getLatestRunSummary();
  if (!summary || !summary.certificateHash) return null;
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-none border border-neutral-700 bg-neutral-900 px-3 py-1 font-mono text-xs uppercase text-neutral-300">
      🔒 VERIFIED ({summary.certificateHash.slice(0, 8)})
    </span>
  );
}

function SummarySkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {["Model", "Jailbreak", "False Positive", "Total"].map((label) => (
        <article
          aria-label={`${label} metric loading`}
          className="h-36 animate-pulse rounded-md border border-neutral-800 bg-neutral-950"
          key={label}
        />
      ))}
    </section>
  );
}

function IncidentSkeleton() {
  return (
    <section className="h-96 animate-pulse rounded-md border border-neutral-800 bg-neutral-950" />
  );
}

function TrendSkeleton() {
  return (
    <section className="h-96 animate-pulse rounded-md border border-neutral-800 bg-neutral-950" />
  );
}

export function DashboardShell() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">
              Guardrail &amp; Red-Team Harness
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <h1 className="text-3xl font-black tracking-tighter text-white sm:text-4xl">
                Red-Team Control Room
              </h1>
              <span className="inline-flex w-fit items-center gap-2 rounded-none border border-neutral-700 bg-neutral-900 px-3 py-1 font-mono text-xs uppercase text-neutral-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-neutral-400" />
                </span>
                PIPELINE: AUTOMATED
              </span>
              <Suspense fallback={null}>
                <CertificateBadge />
              </Suspense>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Monitor the latest Neon-backed run, inspect failure modes, and isolate
              jailbreaks from the active incident stream.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <ExportReportButton />
            <RefreshButton />
          </div>
        </header>

        <Suspense fallback={<TrendSkeleton />}>
          <HistoricalTrend />
        </Suspense>

        <Suspense fallback={<SummarySkeleton />}>
          <RunSummary />
        </Suspense>

        <Suspense fallback={<IncidentSkeleton />}>
          <IncidentLog />
        </Suspense>
      </section>
    </main>
  );
}
