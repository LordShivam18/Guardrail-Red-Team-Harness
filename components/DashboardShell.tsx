import { Suspense } from "react";
import { HistoricalTrend } from "@/components/HistoricalTrend";
import { IncidentLog } from "@/components/IncidentLog";
import { RefreshButton } from "@/components/RefreshButton";
import { RunSummary } from "@/components/RunSummary";

function SummarySkeleton() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {["Model", "Jailbreak", "False Positive", "Total"].map((label) => (
        <article
          aria-label={`${label} metric loading`}
          className="h-36 animate-pulse rounded-lg border border-slate-800 bg-slate-950/70"
          key={label}
        />
      ))}
    </section>
  );
}

function IncidentSkeleton() {
  return (
    <section className="h-96 animate-pulse rounded-lg border border-slate-800 bg-slate-950/70" />
  );
}

function TrendSkeleton() {
  return (
    <section className="h-96 animate-pulse rounded-lg border border-slate-800 bg-slate-950/70" />
  );
}

export function DashboardShell() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Guardrail & Red-Team Harness
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <h1 className="text-3xl font-semibold text-slate-50 sm:text-4xl">
                Red-Team Control Room
              </h1>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/30 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-emerald-100 shadow-[0_0_28px_rgba(52,211,153,0.22),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </span>
                Pipeline: Automated (Nightly Cron Active)
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Monitor the latest Neon-backed run, inspect failure modes, and isolate
              jailbreaks from the active incident stream.
            </p>
          </div>

          <RefreshButton />
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
