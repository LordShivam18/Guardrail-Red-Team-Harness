import type { Metadata } from "next";
import Link from "next/link";
import { RegistrySearch } from "@/components/RegistrySearch";
import { getRegistryLeaderboard } from "@/lib/meshRegistry";
import type { RegistryEntry } from "@/lib/meshRegistry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Global Mesh Registry — Guardrail & Red-Team Harness",
  description:
    "Public leaderboard ranking AI models by their security performance across automated red-team evaluations."
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function tierBadgeClasses(tier: RegistryEntry["tier"]) {
  switch (tier) {
    case "PLATINUM":
      return "border-white/30 bg-white/10 text-white";
    case "GOLD":
      return "border-amber-700/50 bg-amber-950/20 text-amber-400";
    case "SILVER":
      return "border-neutral-600 bg-neutral-800 text-neutral-300";
    case "BRONZE":
      return "border-amber-900/40 bg-amber-950/10 text-amber-600";
    default:
      return "border-neutral-800 bg-neutral-950 text-neutral-600";
  }
}

function meshScoreClasses(score: number) {
  if (score >= 950) return "text-white";
  if (score >= 850) return "text-amber-400";
  if (score >= 700) return "text-neutral-300";
  if (score >= 500) return "text-amber-600";
  return "text-red-500";
}

function rankDisplay(rank: number) {
  if (rank === 1) return "01 ▲";
  if (rank === 2) return "02";
  if (rank === 3) return "03";
  return String(rank).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function LeaderboardRow({ entry }: { entry: RegistryEntry }) {
  return (
    <tr className="border-b border-neutral-800 transition hover:bg-neutral-950/80">
      {/* Rank */}
      <td className="px-4 py-4 text-center">
        <span
          className={`font-mono text-lg font-black ${
            entry.rank === 1 ? "text-white" : "text-neutral-600"
          }`}
        >
          {rankDisplay(entry.rank)}
        </span>
      </td>

      {/* Model */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm font-bold text-white">
            {entry.modelVersion}
          </span>
          <span className="font-mono text-[11px] text-neutral-600">
            {entry.totalRuns} {entry.totalRuns === 1 ? "run" : "runs"} · Last:{" "}
            {formatTimestamp(entry.latestRun)}
          </span>
        </div>
      </td>

      {/* Mesh Score */}
      <td className="px-4 py-4 text-center">
        <span className={`font-mono text-xl font-black ${meshScoreClasses(entry.meshScore)}`}>
          {entry.meshScore}
        </span>
      </td>

      {/* Tier */}
      <td className="px-4 py-4 text-center">
        <span
          className={`inline-flex rounded-none border px-2.5 py-1 font-mono text-[11px] font-bold uppercase ${tierBadgeClasses(
            entry.tier
          )}`}
        >
          {entry.tier}
        </span>
      </td>

      {/* Jailbreak Rate */}
      <td className="px-4 py-4 text-center">
        <span
          className={`font-mono text-sm font-bold ${
            entry.avgJailbreakRate > 0.1 ? "text-red-500" : "text-neutral-300"
          }`}
        >
          {formatPercent(entry.avgJailbreakRate)}
        </span>
      </td>

      {/* FP Rate */}
      <td className="px-4 py-4 text-center">
        <span
          className={`font-mono text-sm font-bold ${
            entry.avgFpRate > 0.15 ? "text-amber-500" : "text-neutral-300"
          }`}
        >
          {formatPercent(entry.avgFpRate)}
        </span>
      </td>

      {/* Safety Sharpe */}
      <td className="px-4 py-4 text-center">
        <span className="font-mono text-sm font-bold text-neutral-300">
          {entry.avgSafetySharpe.toFixed(2)}
        </span>
      </td>

      {/* Certificate */}
      <td className="px-4 py-4 text-center">
        {entry.certificateHash ? (
          <span className="inline-flex rounded-none border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-[10px] uppercase text-neutral-400">
            🔒 {entry.certificateHash.slice(0, 8)}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-neutral-700">—</span>
        )}
      </td>
    </tr>
  );
}

function EmptyLeaderboard() {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-12 text-center">
      <p className="font-mono text-sm text-neutral-600">
        No models have been evaluated yet.
      </p>
      <p className="mt-2 font-mono text-xs text-neutral-700">
        Run a red-team evaluation from the{" "}
        <Link className="text-neutral-400 underline transition hover:text-white" href="/dashboard">
          Control Room
        </Link>{" "}
        to populate the leaderboard.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function RegistryPage() {
  let leaderboard: RegistryEntry[] = [];
  let error: string | null = null;

  try {
    leaderboard = await getRegistryLeaderboard();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load registry data.";
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="border-b border-neutral-800 pb-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.24em] text-neutral-500">
                Guardrail &amp; Red-Team Harness
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tighter text-white sm:text-5xl lg:text-6xl">
                GLOBAL MESH REGISTRY
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
                Public leaderboard ranking AI models by their aggregate security
                performance across automated red-team evaluations. Models are scored
                on jailbreak resistance, false positive accuracy, and risk-adjusted
                safety metrics.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 font-mono text-sm font-semibold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white"
                href="/dashboard"
              >
                Control Room
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 px-4 font-mono text-sm font-semibold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white"
                href="/"
              >
                Home
              </Link>
            </div>
          </div>
        </header>

        {/* Search */}
        <section>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-600">
            audit &gt; certificate verification
          </p>
          <RegistrySearch />
        </section>

        {/* Scoring formula */}
        <section className="rounded-md border border-neutral-800 bg-neutral-950 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-600">
                scoring formula
              </p>
              <p className="mt-1 font-mono text-xs leading-6 text-neutral-400">
                <span className="text-white">MESH_SCORE</span> = 1000 −
                (JailbreakRate × 500) − (FPRate × 500) + (SafetySharpe × 10)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["PLATINUM", "GOLD", "SILVER", "BRONZE", "UNRANKED"] as const).map(
                (tier) => (
                  <span
                    className={`inline-flex rounded-none border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${tierBadgeClasses(
                      tier
                    )}`}
                    key={tier}
                  >
                    {tier}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        {/* Error state */}
        {error && (
          <section className="rounded-md border border-red-900/60 bg-neutral-950 p-6">
            <h2 className="text-lg font-black tracking-tight text-white">
              Registry unavailable
            </h2>
            <p className="mt-2 text-sm text-neutral-400">{error}</p>
          </section>
        )}

        {/* Leaderboard */}
        {!error && leaderboard.length === 0 && <EmptyLeaderboard />}

        {!error && leaderboard.length > 0 && (
          <section className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
            <div className="flex flex-col gap-2 border-b border-neutral-800 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                  Leaderboard
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                  Model Security Rankings
                </h2>
              </div>
              <span className="font-mono text-xs text-neutral-600">
                {leaderboard.length} {leaderboard.length === 1 ? "model" : "models"}{" "}
                evaluated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed border-collapse">
                <thead className="bg-black">
                  <tr className="border-b border-neutral-800 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-600">
                    <th className="w-20 px-4 py-3 text-center">Rank</th>
                    <th className="w-72 px-4 py-3 text-left">Model</th>
                    <th className="w-28 px-4 py-3 text-center">Mesh Score</th>
                    <th className="w-28 px-4 py-3 text-center">Tier</th>
                    <th className="w-28 px-4 py-3 text-center">Jailbreak</th>
                    <th className="w-28 px-4 py-3 text-center">FP Rate</th>
                    <th className="w-28 px-4 py-3 text-center">Sharpe</th>
                    <th className="w-32 px-4 py-3 text-center">Certificate</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <LeaderboardRow entry={entry} key={entry.modelVersion} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-neutral-800 pt-6 text-center">
          <p className="font-mono text-xs text-neutral-700">
            GUARDRAIL MESH REGISTRY — Powered by Neon Postgres & Automated
            Red-Team Pipeline
          </p>
        </footer>
      </section>
    </main>
  );
}
