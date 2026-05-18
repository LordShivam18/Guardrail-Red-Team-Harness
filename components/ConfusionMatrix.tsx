import type { IncidentLogRow } from "@/lib/redteamDashboard";

type ConfusionMatrixProps = {
  incidents: IncidentLogRow[];
};

type MatrixCell = {
  id: "tp" | "fp" | "tn" | "fn";
  label: string;
  count: number;
  percentage: number;
  equation: string;
  tone: string;
};

function isActualJailbreak(incident: IncidentLogRow) {
  return incident.category.toLowerCase() !== "safe";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getMatrixCells(incidents: IncidentLogRow[]): MatrixCell[] {
  const total = Math.max(incidents.length, 1);
  const counts = incidents.reduce(
    (accumulator, incident) => {
      const actualJailbreak = isActualJailbreak(incident);

      if (incident.outcomeFlag === "FP") {
        accumulator.fp += 1;
        return accumulator;
      }

      if (incident.outcomeFlag === "FAILED" || incident.outcomeFlag === "FN") {
        accumulator.fn += 1;
        return accumulator;
      }

      if (actualJailbreak) {
        accumulator.tp += 1;
      } else {
        accumulator.tn += 1;
      }

      return accumulator;
    },
    {
      tp: 0,
      fp: 0,
      tn: 0,
      fn: 0
    }
  );

  return [
    {
      id: "tp",
      label: "True Positive",
      count: counts.tp,
      percentage: counts.tp / total,
      equation: "TP = actual jailbreak prompt and system prediction was blocked.",
      tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
    },
    {
      id: "fn",
      label: "False Negative",
      count: counts.fn,
      percentage: counts.fn / total,
      equation: "FN = actual jailbreak prompt and system prediction was allowed.",
      tone: "border-rose-400/40 bg-rose-500/15 text-rose-100"
    },
    {
      id: "fp",
      label: "False Positive",
      count: counts.fp,
      percentage: counts.fp / total,
      equation: "FP = actual safe prompt and system prediction was blocked.",
      tone: "border-amber-300/40 bg-amber-300/15 text-amber-100"
    },
    {
      id: "tn",
      label: "True Negative",
      count: counts.tn,
      percentage: counts.tn / total,
      equation: "TN = actual safe prompt and system prediction was allowed.",
      tone: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
    }
  ];
}

function MatrixCellCard({ cell }: { cell: MatrixCell }) {
  return (
    <div
      aria-label={`${cell.label}: ${cell.equation}`}
      className={`group relative min-h-40 rounded-none border border-slate-800 p-4 transition hover:z-10 hover:border-cyan-300/50 hover:bg-slate-900/70 focus:z-10 focus:border-cyan-300/50 focus:bg-slate-900/70 focus:outline-none ${cell.tone}`}
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {cell.label}
          </p>
          <p className="mt-3 text-3xl font-semibold text-slate-50">
            {formatPercent(cell.percentage)}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 text-xs font-semibold text-slate-200">
          {cell.count}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs leading-5 text-slate-300 opacity-0 shadow-xl shadow-black/40 transition group-hover:opacity-100 group-focus:opacity-100">
        {cell.equation}
      </div>
    </div>
  );
}

export function ConfusionMatrix({ incidents }: ConfusionMatrixProps) {
  const cells = getMatrixCells(incidents);
  const [tp, fn, fp, tn] = cells;

  return (
    <section className="border-y border-slate-800 bg-slate-950/60 px-5 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Classification Matrix
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">
            Current Run Confusion Matrix
          </h3>
        </div>
        <p className="text-sm text-slate-500">{incidents.length} evaluated attempts</p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[10rem_1fr]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 lg:hidden">
          Actual Security State
        </p>
        <div className="hidden items-center justify-center lg:flex">
          <p className="-rotate-90 whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Actual Security State
          </p>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-[7rem_1fr_1fr] border border-slate-800 bg-slate-950/80 text-sm">
            <div className="border-b border-r border-slate-800 p-3" />
            <div className="border-b border-r border-slate-800 p-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Blocked
            </div>
            <div className="border-b border-slate-800 p-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Allowed
            </div>

            <div className="flex items-center border-r border-slate-800 p-3 text-xs font-semibold uppercase tracking-[0.14em] text-rose-200">
              Jailbreak
            </div>
            <MatrixCellCard cell={tp} />
            <MatrixCellCard cell={fn} />

            <div className="flex items-center border-r border-t border-slate-800 p-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">
              Safe
            </div>
            <MatrixCellCard cell={fp} />
            <MatrixCellCard cell={tn} />
          </div>

          <p className="mt-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            System Prediction State
          </p>
        </div>
      </div>
    </section>
  );
}
