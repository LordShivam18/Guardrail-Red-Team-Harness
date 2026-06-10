import { ConfusionMatrix } from "@/components/ConfusionMatrix";
import { IncidentLogTable } from "@/components/IncidentLogTable";
import { getLatestRunIncidents } from "@/lib/redteamDashboard";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export async function IncidentLog() {
  try {
    const data = await getLatestRunIncidents();

    if (!data) {
      return (
        <section className="rounded-md border border-neutral-800 bg-neutral-950 p-6">
          <h2 className="text-lg font-black tracking-tight text-white">Incident Log</h2>
          <p className="mt-2 text-sm text-neutral-500">
            No incident records are available yet.
          </p>
        </section>
      );
    }

    return (
      <section
        className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-950"
        id="incident-log"
      >
        <div className="flex flex-col gap-2 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
              Incident Log
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Table of Attempts
            </h2>
          </div>
          <p className="font-mono text-sm text-neutral-500">
            Run {data.runId.slice(0, 8)} — {formatTimestamp(data.timestamp)}
          </p>
        </div>

        <ConfusionMatrix incidents={data.incidents} />

        <IncidentLogTable incidents={data.incidents} />
      </section>
    );
  } catch (error) {
    return (
      <section className="rounded-md border border-red-900/60 bg-neutral-950 p-6">
        <h2 className="text-lg font-black tracking-tight text-white">Incident log unavailable</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {error instanceof Error ? error.message : "The database returned an unknown error."}
        </p>
      </section>
    );
  }
}
