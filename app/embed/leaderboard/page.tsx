import { getRegistryLeaderboard } from "@/lib/meshRegistry";
import type { RegistryEntry } from "@/lib/meshRegistry";
import type { MeshTier } from "@/lib/meshScore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmbedSearchParams = {
  limit?: string | string[];
  tier?: string | string[];
};

const VALID_TIERS: MeshTier[] = ["PLATINUM", "GOLD", "SILVER", "BRONZE", "UNRANKED"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(searchParams: EmbedSearchParams) {
  const raw = Number(firstParam(searchParams.limit) ?? 5);

  if (!Number.isFinite(raw)) {
    return 5;
  }

  return Math.min(Math.max(Math.trunc(raw), 1), 25);
}

function parseTier(searchParams: EmbedSearchParams) {
  const raw = firstParam(searchParams.tier)?.trim().toUpperCase();

  if (!raw || !VALID_TIERS.includes(raw as MeshTier)) {
    return null;
  }

  return raw as MeshTier;
}

function tierClasses(tier: MeshTier) {
  switch (tier) {
    case "PLATINUM":
      return "border-violet-400/60 bg-violet-950/20 text-violet-200";
    case "GOLD":
      return "border-amber-400/50 bg-amber-950/20 text-amber-200";
    case "SILVER":
      return "border-neutral-400/50 bg-neutral-900 text-neutral-200";
    case "BRONZE":
      return "border-orange-500/40 bg-orange-950/20 text-orange-300";
    default:
      return "border-red-900/60 bg-red-950/20 text-red-300";
  }
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function EmbedLeaderboardPage({
  searchParams
}: {
  searchParams: EmbedSearchParams;
}) {
  const limit = parseLimit(searchParams);
  const tier = parseTier(searchParams);
  let error: string | null = null;
  let entries: RegistryEntry[] = [];

  try {
    const leaderboard = await getRegistryLeaderboard();
    entries = (tier ? leaderboard.filter((entry) => entry.tier === tier) : leaderboard).slice(
      0,
      limit
    );
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load leaderboard.";
  }

  return (
    <main className="min-h-screen w-full min-w-0 bg-black p-3 text-white sm:p-4">
      <section className="mx-auto flex w-full max-w-[46rem] flex-col gap-3">
        <header className="border-b border-neutral-800 pb-3">
          <div className="flex min-w-0 items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">
                Guardrail Mesh
              </p>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white">
                Public Leaderboard
              </h1>
            </div>
            <span className="shrink-0 border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[10px] font-bold uppercase text-neutral-500">
              v1.0
            </span>
          </div>
          {tier ? (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              Tier filter: <span className="text-neutral-200">{tier}</span>
            </p>
          ) : null}
        </header>

        {error ? (
          <section className="border border-red-900/70 bg-red-950/10 p-3">
            <h2 className="font-mono text-xs font-black uppercase text-red-300">
              Leaderboard unavailable
            </h2>
            <p className="mt-2 text-xs leading-5 text-neutral-400">{error}</p>
          </section>
        ) : entries.length === 0 ? (
          <section className="border border-neutral-800 bg-neutral-950 p-4 text-center">
            <p className="font-mono text-xs uppercase text-neutral-500">
              No evaluated models
            </p>
          </section>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border border-neutral-800 bg-neutral-950 p-3"
                key={entry.modelVersion}
              >
                <span className="flex h-9 w-9 items-center justify-center border border-neutral-700 bg-black font-mono text-sm font-black text-white">
                  {entry.rank}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-white">
                    {entry.modelVersion}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-neutral-500">
                    JB {formatRate(entry.avgJailbreakRate)} / FP {formatRate(entry.avgFpRate)} /
                    Sharpe {entry.avgSafetySharpe.toFixed(2)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-lg font-black leading-none text-white">
                    {entry.meshScore}
                  </span>
                  <span
                    className={`border px-1.5 py-0.5 font-mono text-[10px] font-black uppercase ${tierClasses(
                      entry.tier
                    )}`}
                  >
                    {entry.tier}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
