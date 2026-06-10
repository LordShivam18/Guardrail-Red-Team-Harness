import { WhiteboxDiagnostics } from "@/components/WhiteboxDiagnostics";
import { getWhiteboxDiagnosticsData } from "@/lib/dashboardVisualData";

export async function WhiteboxDiagnosticsPanel() {
  try {
    const diagnostics = await getWhiteboxDiagnosticsData();

    if (!diagnostics) {
      return <WhiteboxDiagnostics events={[]} varianceSeries={[]} />;
    }

    return (
      <WhiteboxDiagnostics
        events={diagnostics.events}
        runLabel={`${diagnostics.modelVersion} / ${diagnostics.runId.slice(0, 8)}`}
        varianceSeries={diagnostics.varianceSeries}
      />
    );
  } catch (error) {
    return (
      <section className="rounded-md border border-red-900/60 bg-neutral-950 p-6">
        <h2 className="text-lg font-black tracking-tight text-white">Whitebox diagnostics unavailable</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {error instanceof Error ? error.message : "The database returned an unknown error."}
        </p>
      </section>
    );
  }
}
