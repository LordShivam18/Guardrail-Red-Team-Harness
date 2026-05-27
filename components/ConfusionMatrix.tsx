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
      tone: "border-neutral-700 bg-neutral-900 text-white"
    },
    {
      id: "fn",
      label: "False Negative",
      count: counts.fn,
      percentage: counts.fn / total,
      equation: "FN = actual jailbreak prompt and system prediction was allowed.",
      tone: "border-red-900/60 bg-red-950/30 text-red-400"
    },
    {
      id: "fp",
      label: "False Positive",
      count: counts.fp,
      percentage: counts.fp / total,
      equation: "FP = actual safe prompt and system prediction was blocked.",
      tone: "border-amber-900/50 bg-amber-950/20 text-amber-400"
    },
    {
      id: "tn",
      label: "True Negative",
      count: counts.tn,
      percentage: counts.tn / total,
      equation: "TN = actual safe prompt and system prediction was allowed.",
      tone: "border-neutral-700 bg-neutral-900 text-neutral-300"
    }
  ];
}

function MatrixCellCard({ cell }: { cell: MatrixCell }) {
  return (
    <div
      aria-label={`${cell.label}: ${cell.equation}`}
      className={`group relative min-h-40 rounded-none border border-neutral-800 p-4 transition hover:z-10 hover:border-neutral-600 focus:z-10 focus:border-neutral-600 focus:outline-none ${cell.tone}`}
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
            {cell.label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {formatPercent(cell.percentage)}
          </p>
        </div>
        <span className="rounded-none border border-neutral-700 bg-black px-2 py-1 font-mono text-xs font-semibold text-neutral-400">
          {cell.count}
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 rounded-md border border-neutral-700 bg-black px-3 py-2 font-mono text-xs leading-5 text-neutral-400 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
        {cell.equation}
      </div>
    </div>
  );
}

export function ConfusionMatrix({ incidents }: ConfusionMatrixProps) {
  const cells = getMatrixCells(incidents);
  const [tp, fn, fp, tn] = cells;

  return (
    <section className="border-y border-neutral-800 bg-black px-5 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
            Classification Matrix
          </p>
          <h3 className="mt-2 text-xl font-black tracking-tight text-white">
            Current Run Confusion Matrix
          </h3>
        </div>
        <p className="font-mono text-sm text-neutral-500">{incidents.length} evaluated attempts</p>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[10rem_1fr]">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500 lg:hidden">
          Actual Security State
        </p>
        <div className="hidden items-center justify-center lg:flex">
          <p className="-rotate-90 whitespace-nowrap font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
            Actual Security State
          </p>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-[7rem_1fr_1fr] border border-neutral-800 bg-black text-sm">
            <div className="border-b border-r border-neutral-800 p-3" />
            <div className="border-b border-r border-neutral-800 p-3 text-center font-mono text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              Blocked
            </div>
            <div className="border-b border-neutral-800 p-3 text-center font-mono text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              Allowed
            </div>

            <div className="flex items-center border-r border-neutral-800 p-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-red-500">
              Jailbreak
            </div>
            <MatrixCellCard cell={tp} />
            <MatrixCellCard cell={fn} />

            <div className="flex items-center border-r border-t border-neutral-800 p-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
              Safe
            </div>
            <MatrixCellCard cell={fp} />
            <MatrixCellCard cell={tn} />
          </div>

          <p className="mt-3 text-center font-mono text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
            System Prediction State
          </p>
        </div>
      </div>
    </section>
  );
}
