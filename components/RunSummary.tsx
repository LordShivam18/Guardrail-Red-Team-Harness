import { getLatestRunSummary } from "@/lib/redteamDashboard";

type StatIntent = "neutral" | "danger" | "warning" | "success";

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
        <section className="rounded-md border border-neutral-800 bg-neutral-950 p-6">
          <h2 className="text-lg font-black tracking-tight text-white">Latest Run Summary</h2>
          <p className="mt-2 text-sm text-neutral-500">
            No red-team runs have been recorded yet.
          </p>
        </section>
      );
    }

    const stats = [
      {
        label: "Model Version",
        value: summary.modelVersion,
        detail: `Latest run ${summary.runId.slice(0, 8)}`,
        intent: "neutral" as const
      },
      {
        label: "Jailbreak Success Rate",
        value: `${formatPercent(summary.jailbreakRate)} Failure`,
        detail: "Failed refusal-expected tests",
        intent: "danger" as const
      },
      {
        label: "False Positive Rate",
        value: formatPercent(summary.falsePositiveRate),
        detail: "Safe prompts incorrectly blocked",
        intent: "warning" as const
      },
      {
        label: "Total Tests",
        value: summary.totalTests.toLocaleString(),
        detail: `Completed ${formatTimestamp(summary.timestamp)}`,
        intent: "neutral" as const
      },
      {
        label: "Safety Sharpe Ratio (SSR)",
        value: summary.safetySharpe?.toFixed(2) || "N/A",
        detail: "Risk-adjusted safety",
        intent: (summary.safetySharpe && summary.safetySharpe > 1.5 ? "success" : "warning") as StatIntent
      },
      {
        label: "Compute Exhaustion (ΔC)",
        value: summary.maxComputeShift?.toFixed(2) || "N/A",
        detail: summary.maxComputeShift && summary.maxComputeShift > 3.0 ? "Potential DoS" : "Stable compute",
        intent: (summary.maxComputeShift && summary.maxComputeShift > 3.0 ? "danger" : "neutral") as StatIntent
      }
    ];

    return (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className="rounded-md border border-neutral-800 bg-neutral-950 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                {stat.label}
              </p>
              <span
                className={
                  stat.intent === "danger"
                    ? "h-2 w-2 rounded-full bg-red-500"
                    : stat.intent === "warning"
                      ? "h-2 w-2 rounded-full bg-amber-400"
                      : stat.intent === "success"
                        ? "h-2 w-2 rounded-full bg-white"
                        : "h-2 w-2 rounded-full bg-neutral-600"
                }
              />
            </div>
            <p className="mt-4 break-words text-2xl font-black tracking-tight text-white">
              {stat.value}
            </p>
            <p className="mt-3 text-sm text-neutral-500">{stat.detail}</p>
          </article>
        ))}
      </section>
    );
  } catch (error) {
    return (
      <section className="rounded-md border border-red-900/60 bg-neutral-950 p-6">
        <h2 className="text-lg font-black tracking-tight text-white">Summary unavailable</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {error instanceof Error ? error.message : "The database returned an unknown error."}
        </p>
      </section>
    );
  }
}
