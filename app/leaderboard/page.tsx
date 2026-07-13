import Link from "next/link";
import { CitationFooter } from "@/components/CitationFooter";
import { ModelLatencyBarChart } from "@/components/ModelLatencyBarChart";
import { getModelComparisonSummary } from "@/lib/db";
import type { ModelComparisonSummary } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatLatency(value: number | null) {
  return value === null ? "Not tracked" : `${Math.round(value).toLocaleString()} ms`;
}

function formatInteger(value: number) {
  return value.toLocaleString();
}

function tierBadgeClasses(summary: ModelComparisonSummary) {
  if (summary.tier === "PLATINUM") {
    return "border-white bg-white text-black";
  }

  if (summary.tier === "GOLD") {
    return "border-white bg-neutral-100 text-black";
  }

  if (summary.tier === "SILVER") {
    return "border-neutral-500 bg-neutral-900 text-white";
  }

  if (summary.tier === "BRONZE") {
    return "border-neutral-700 bg-black text-neutral-300";
  }

  return "border-red-900/70 bg-red-950/30 text-red-400";
}

function rankTone(index: number) {
  if (index === 0) {
    return "border-white bg-white text-black";
  }

  return "border-neutral-700 bg-neutral-900 text-neutral-300";
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
    if (right.meshScore !== left.meshScore) {
      return right.meshScore - left.meshScore;
    }

    if (right.defusalSuccessRate !== left.defusalSuccessRate) {
      return right.defusalSuccessRate - left.defusalSuccessRate;
    }

    return left.modelName.localeCompare(right.modelName);
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
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-7 px-5 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-neutral-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-neutral-500">
              /security/leaderboard
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Mesh Score Leaderboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
              Ranked by the canonical Guardrail Mesh score across persisted red-team
              runs: jailbreak resistance, false-positive rate, and Safety Sharpe.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex h-10 items-center rounded-md border border-neutral-700 bg-neutral-900 px-4 font-mono text-sm font-semibold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white focus:outline-none focus:ring-1 focus:ring-neutral-500"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="inline-flex h-10 items-center rounded-md border border-neutral-700 bg-neutral-900 px-4 font-mono text-sm font-semibold uppercase text-neutral-300 transition hover:border-neutral-500 hover:text-white focus:outline-none focus:ring-1 focus:ring-neutral-500"
              href="/registry"
            >
              Registry
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <section className="rounded-md border border-red-900/70 bg-neutral-950 p-6">
            <h2 className="text-lg font-black tracking-tight text-white">Leaderboard unavailable</h2>
            <p className="mt-2 text-sm text-red-400">{errorMessage}</p>
          </section>
        ) : summaries.length === 0 ? (
          <section className="rounded-md border border-neutral-800 bg-neutral-950 p-6">
            <h2 className="text-lg font-black tracking-tight text-white">No model runs recorded</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Run the red-team harness against at least one target model to populate this
              leaderboard.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-md border border-neutral-800 bg-neutral-950 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                  Top Ranked Model
                </p>
                <p className="mt-4 break-words text-2xl font-black text-white">
                  {topModel.modelName}
                </p>
                <p className="mt-3 font-mono text-sm text-neutral-400">
                  Mesh Score {topModel.meshScore}
                </p>
              </article>

              <article className="rounded-md border border-neutral-800 bg-neutral-950 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                  Models Evaluated
                </p>
                <p className="mt-4 text-3xl font-black text-white">
                  {formatInteger(summaries.length)}
                </p>
                <p className="mt-3 text-sm text-neutral-500">
                  {formatInteger(totalInteractions)} total interactions
                </p>
              </article>

              <article className="rounded-md border border-neutral-800 bg-neutral-950 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                  Fastest Average
                </p>
                <p className="mt-4 text-3xl font-black text-white">
                  {formatLatency(bestLatency)}
                </p>
                <p className="mt-3 text-sm text-neutral-500">Tracked execution latency</p>
              </article>

              <article className="rounded-md border border-neutral-800 bg-neutral-950 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                  False Positives
                </p>
                <p className="mt-4 text-3xl font-black text-red-500">
                  {formatInteger(totalFalsePositives)}
                </p>
                <p className="mt-3 text-sm text-neutral-500">Safe prompts blocked by mistake</p>
              </article>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.65fr)]">
              <div className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950">
                <div className="flex flex-col gap-3 border-b border-neutral-800 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                      Ordered Tracking Grid
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                      Mesh Rankings
                    </h2>
                  </div>
                  <p className="font-mono text-sm text-neutral-500">
                    Sorted by highest Mesh Score
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-[64rem] w-full border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-black text-left font-mono text-xs uppercase tracking-[0.16em] text-neutral-500">
                        <th className="px-5 py-3 font-semibold">Rank</th>
                        <th className="px-5 py-3 font-semibold">Target Model</th>
                        <th className="px-5 py-3 font-semibold">Tier</th>
                        <th className="px-5 py-3 text-right font-semibold">Mesh Score</th>
                        <th className="px-5 py-3 text-right font-semibold">Jailbreak</th>
                        <th className="px-5 py-3 text-right font-semibold">FP Rate</th>
                        <th className="px-5 py-3 text-right font-semibold">Sharpe</th>
                        <th className="px-5 py-3 text-right font-semibold">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((summary, index) => (
                        <tr
                          className="border-b border-neutral-800 transition hover:bg-black"
                          key={summary.modelName}
                        >
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-mono text-sm font-black ${rankTone(
                                index
                              )}`}
                            >
                              {index + 1}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="max-w-sm break-words text-sm font-bold text-white">
                              {summary.modelName}
                            </p>
                            <p className="mt-1 font-mono text-xs text-neutral-500">
                              {formatInteger(summary.totalAttackInteractions)} attack prompts
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-none border px-3 py-1 font-mono text-xs font-black uppercase ${tierBadgeClasses(
                                summary
                              )}`}
                            >
                              {summary.tier}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xl font-black text-white">
                            {summary.meshScore}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-red-500">
                            {formatRate(summary.avgJailbreakRate)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                            {formatRate(summary.avgFpRate)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                            {summary.avgSafetySharpe.toFixed(2)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                            {formatLatency(summary.averageLatencyMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="rounded-md border border-neutral-800 bg-neutral-950 p-5">
                <div className="mb-4">
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                    Latency Profile
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                    Average Runtime
                  </h2>
                </div>
                <ModelLatencyBarChart summaries={summaries} />

                <div className="mt-5 rounded-md border border-neutral-800 bg-black p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-600">
                    Mesh Score Formula
                  </p>
                  <p className="mt-2 font-mono text-xs leading-6 text-neutral-400">
                    1000 - jailbreak_rate * 500 - fp_rate * 500 + safety_sharpe * 10
                    + modality_bonus
                  </p>
                  <p className="mt-2 text-xs leading-5 text-neutral-500">
                    Modality bonus: +5 for each additional evaluated modality beyond text,
                    clamped at 1000.
                  </p>
                </div>
              </aside>
            </section>
          </>
        )}

        <CitationFooter />
      </section>
    </main>
  );
}
