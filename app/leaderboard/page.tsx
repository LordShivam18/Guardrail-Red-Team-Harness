import Link from "next/link";
import { ModelLatencyBarChart } from "@/components/ModelLatencyBarChart";
import { getModelComparisonSummary } from "@/lib/db";
import type { ModelComparisonSummary } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatLatency(value: number | null) {
  return value === null ? "Not tracked" : `${Math.round(value).toLocaleString()} ms`;
}

function formatInteger(value: number) {
  return value.toLocaleString();
}

function getGradeBadge(summary: ModelComparisonSummary) {
  if (summary.defusalSuccessRate > 98) {
    return {
      label: "Grade A",
      className:
        "border-emerald-300/45 bg-emerald-400/15 text-emerald-100 shadow-[0_0_24px_rgba(52,211,153,0.26)]"
    };
  }

  return {
    label: "Review",
    className: "border-amber-300/30 bg-amber-300/10 text-amber-100"
  };
}

function getRankTone(index: number) {
  if (index === 0) {
    return "border-emerald-300/35 bg-emerald-400/15 text-emerald-100";
  }

  if (index === 1) {
    return "border-cyan-300/30 bg-cyan-400/10 text-cyan-100";
  }

  return "border-slate-700 bg-slate-900/80 text-slate-300";
}

function getBestLatency(summaries: ModelComparisonSummary[]) {
  const trackedLatencies = summaries
    .map((summary) => summary.averageLatencyMs)
    .filter((latency): latency is number => latency !== null);

  if (trackedLatencies.length === 0) {
    return null;
  }

  return Math.min(...trackedLatencies);
}

async function loadLeaderboard() {
  const summaries = await getModelComparisonSummary();

  return [...summaries].sort((left, right) => {
    if (right.defusalSuccessRate !== left.defusalSuccessRate) {
      return right.defusalSuccessRate - left.defusalSuccessRate;
    }

    if (left.averageLatencyMs === null && right.averageLatencyMs === null) {
      return left.modelName.localeCompare(right.modelName);
    }

    if (left.averageLatencyMs === null) {
      return 1;
    }

    if (right.averageLatencyMs === null) {
      return -1;
    }

    return left.averageLatencyMs - right.averageLatencyMs;
  });
}

export default async function LeaderboardPage() {
  let summaries: ModelComparisonSummary[] = [];
  let errorMessage: string | null = null;

  try {
    summaries = await loadLeaderboard();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "The database returned an unknown error.";
  }

  const topModel = summaries[0];
  const totalInteractions = summaries.reduce(
    (total, summary) => total + summary.totalInteractions,
    0
  );
  const totalFalsePositives = summaries.reduce(
    (total, summary) => total + summary.falsePositiveCount,
    0
  );
  const bestLatency = getBestLatency(summaries);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_18%_8%,rgba(16,185,129,0.15),transparent_28%),radial-gradient(circle_at_82%_6%,rgba(34,211,238,0.12),transparent_26%),radial-gradient(circle_at_48%_42%,rgba(245,158,11,0.08),transparent_30%),#020617] text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-7 px-5 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              /security/leaderboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-50 sm:text-4xl">
              Multi-Model Security Leaderboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Compare model defusal rates, false positives, and latency signatures across
              stored red-team runs.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center rounded-md border border-slate-700 bg-slate-950/70 px-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/60 hover:text-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-300/35"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="inline-flex h-10 items-center rounded-md border border-emerald-300/35 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/70 hover:bg-emerald-400/15 focus:outline-none focus:ring-2 focus:ring-emerald-300/35"
              href="/playground"
            >
              Playground
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <section className="rounded-lg border border-rose-900/80 bg-rose-950/30 p-6 shadow-xl shadow-black/25">
            <h2 className="text-lg font-semibold text-rose-100">Leaderboard unavailable</h2>
            <p className="mt-2 text-sm text-rose-200">{errorMessage}</p>
          </section>
        ) : summaries.length === 0 ? (
          <section className="rounded-lg border border-slate-800 bg-slate-950/75 p-6 shadow-xl shadow-black/25">
            <h2 className="text-lg font-semibold text-slate-100">No model runs recorded</h2>
            <p className="mt-2 text-sm text-slate-400">
              Run the red-team harness against at least one target model to populate this
              leaderboard.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-lg border border-white/10 bg-slate-950/75 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Top Ranked Model
                </p>
                <p className="mt-4 break-words text-2xl font-semibold text-slate-50">
                  {topModel.modelName}
                </p>
                <p className="mt-3 text-sm text-emerald-200">
                  {formatPercent(topModel.defusalSuccessRate)} defusal success
                </p>
              </article>

              <article className="rounded-lg border border-white/10 bg-slate-950/75 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Models Evaluated
                </p>
                <p className="mt-4 text-3xl font-semibold text-slate-50">
                  {formatInteger(summaries.length)}
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  {formatInteger(totalInteractions)} total interactions
                </p>
              </article>

              <article className="rounded-lg border border-white/10 bg-slate-950/75 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Fastest Average
                </p>
                <p className="mt-4 text-3xl font-semibold text-cyan-100">
                  {formatLatency(bestLatency)}
                </p>
                <p className="mt-3 text-sm text-slate-400">Tracked execution latency</p>
              </article>

              <article className="rounded-lg border border-white/10 bg-slate-950/75 p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  False Positives
                </p>
                <p className="mt-4 text-3xl font-semibold text-amber-100">
                  {formatInteger(totalFalsePositives)}
                </p>
                <p className="mt-3 text-sm text-slate-400">Safe prompts blocked by mistake</p>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)]">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/75 shadow-2xl shadow-black/30 backdrop-blur-xl">
                <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      Ordered Tracking Grid
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                      Defusal Rankings
                    </h2>
                  </div>
                  <p className="text-sm text-slate-500">Sorted by highest success rate</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[58rem] w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th className="px-5 py-3 font-semibold">Rank</th>
                        <th className="px-5 py-3 font-semibold">Target Model</th>
                        <th className="px-5 py-3 font-semibold">Grade</th>
                        <th className="px-5 py-3 text-right font-semibold">Defusal</th>
                        <th className="px-5 py-3 text-right font-semibold">Blocked</th>
                        <th className="px-5 py-3 text-right font-semibold">Interactions</th>
                        <th className="px-5 py-3 text-right font-semibold">Latency</th>
                        <th className="px-5 py-3 text-right font-semibold">FP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((summary, index) => {
                        const badge = getGradeBadge(summary);

                        return (
                          <tr
                            className="border-b border-white/10 transition hover:bg-white/[0.04]"
                            key={summary.modelName}
                          >
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-semibold ${getRankTone(
                                  index
                                )}`}
                              >
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <p className="max-w-sm break-words text-sm font-semibold text-slate-100">
                                {summary.modelName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatInteger(summary.totalAttackInteractions)} attack prompts
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right text-sm font-semibold text-emerald-100">
                              {formatPercent(summary.defusalSuccessRate)}
                            </td>
                            <td className="px-5 py-4 text-right text-sm text-slate-300">
                              {formatInteger(summary.blockedAttempts)}
                            </td>
                            <td className="px-5 py-4 text-right text-sm text-slate-300">
                              {formatInteger(summary.totalInteractions)}
                            </td>
                            <td className="px-5 py-4 text-right text-sm text-cyan-100">
                              {formatLatency(summary.averageLatencyMs)}
                            </td>
                            <td className="px-5 py-4 text-right text-sm text-amber-100">
                              {formatInteger(summary.falsePositiveCount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="rounded-lg border border-white/10 bg-slate-950/75 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Latency Profile
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                    Average Runtime
                  </h2>
                </div>
                <ModelLatencyBarChart summaries={summaries} />
              </aside>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
