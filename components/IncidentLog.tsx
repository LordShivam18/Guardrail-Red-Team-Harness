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
        <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Incident Log</h2>
          <p className="mt-2 text-sm text-slate-400">
            No incident records are available yet.
          </p>
        </section>
      );
    }

    return (
      <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-2 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Incident Log
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">
              Table of Attempts
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Run {data.runId.slice(0, 8)} - {formatTimestamp(data.timestamp)}
          </p>
        </div>

        <IncidentLogTable incidents={data.incidents} />
      </section>
    );
  } catch (error) {
    return (
      <section className="rounded-lg border border-rose-900/80 bg-rose-950/30 p-6">
        <h2 className="text-lg font-semibold text-rose-100">Incident log unavailable</h2>
        <p className="mt-2 text-sm text-rose-200">
          {error instanceof Error ? error.message : "Supabase returned an unknown error."}
        </p>
      </section>
    );
  }
}
