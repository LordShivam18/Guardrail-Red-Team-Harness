import { HistoricalTrendChart } from "@/components/HistoricalTrendChart";
import { getHistoricalRunSummary } from "@/lib/db";

export async function HistoricalTrend() {
  try {
    const runs = await getHistoricalRunSummary(7);

    return <HistoricalTrendChart runs={runs} />;
  } catch (error) {
    return (
      <section className="rounded-md border border-red-900/60 bg-neutral-950 p-6">
        <h2 className="text-lg font-black tracking-tight text-white">Timeline unavailable</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {error instanceof Error ? error.message : "The database returned an unknown error."}
        </p>
      </section>
    );
  }
}
