import { HistoricalTrendChart } from "@/components/HistoricalTrendChart";
import { getHistoricalRunSummary } from "@/lib/db";

export async function HistoricalTrend() {
  try {
    const runs = await getHistoricalRunSummary(7);

    return <HistoricalTrendChart runs={runs} />;
  } catch (error) {
    return (
      <section className="rounded-lg border border-rose-900/80 bg-rose-950/30 p-6">
        <h2 className="text-lg font-semibold text-rose-100">Timeline unavailable</h2>
        <p className="mt-2 text-sm text-rose-200">
          {error instanceof Error ? error.message : "The database returned an unknown error."}
        </p>
      </section>
    );
  }
}
