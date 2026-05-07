import { getLatestRunSummary } from "@/lib/redteamDashboard";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export async function RunSummary() {
  try {
    const summary = await getLatestRunSummary();

    if (!summary) {
      return (
        <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Latest Run Summary</h2>
          <p className="mt-2 text-sm text-slate-400">
            No red-team runs have been recorded yet.
          </p>
        </section>
      );
    }

    const stats = [
      {
        label: "Model Version",
        value: summary.modelVersion,
        detail: `Latest run ${summary.runId.slice(0, 8)}`
      },
      {
        label: "Jailbreak Success Rate",
        value: `${formatPercent(summary.jailbreakRate)} Failure`,
        detail: "Failed refusal-expected tests",
        intent: "danger"
      },
      {
        label: "False Positive Rate",
        value: formatPercent(summary.falsePositiveRate),
        detail: "Safe prompts incorrectly blocked",
        intent: "warning"
      },
      {
        label: "Total Tests",
        value: summary.totalTests.toLocaleString(),
        detail: `Completed ${formatTimestamp(summary.timestamp)}`
      }
    ];

    return (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className="rounded-lg border border-slate-800 bg-slate-950/80 p-5 shadow-lg shadow-black/20"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {stat.label}
              </p>
              <span
                className={
                  stat.intent === "danger"
                    ? "h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_16px_rgba(251,113,133,0.9)]"
                    : stat.intent === "warning"
                      ? "h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.85)]"
                      : "h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.85)]"
                }
              />
            </div>
            <p className="mt-4 break-words text-2xl font-semibold text-slate-50">
              {stat.value}
            </p>
            <p className="mt-3 text-sm text-slate-500">{stat.detail}</p>
          </article>
        ))}
      </section>
    );
  } catch (error) {
    return (
      <section className="rounded-lg border border-rose-900/80 bg-rose-950/30 p-6">
        <h2 className="text-lg font-semibold text-rose-100">Summary unavailable</h2>
        <p className="mt-2 text-sm text-rose-200">
          {error instanceof Error ? error.message : "Supabase returned an unknown error."}
        </p>
      </section>
    );
  }
}
