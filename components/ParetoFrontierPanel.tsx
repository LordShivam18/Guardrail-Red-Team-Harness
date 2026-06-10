import { ParetoFrontier } from "@/components/ParetoFrontier";
import { getParetoFrontierRows } from "@/lib/dashboardVisualData";

export async function ParetoFrontierPanel() {
  try {
    const points = await getParetoFrontierRows(50);

    return <ParetoFrontier points={points} />;
  } catch (error) {
    return (
      <section className="rounded-md border border-red-900/60 bg-neutral-950 p-6">
        <h2 className="text-lg font-black tracking-tight text-white">Pareto frontier unavailable</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {error instanceof Error ? error.message : "The database returned an unknown error."}
        </p>
      </section>
    );
  }
}
