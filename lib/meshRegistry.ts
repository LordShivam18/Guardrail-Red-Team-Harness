import { sql } from "./db";
import { calculateMeshScore, getMeshTier } from "./meshScore";
import type { MeshTier } from "./meshScore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RegistryRow = {
  model_version: string;
  total_runs: number;
  latest_run: string;
  avg_jailbreak_rate: number;
  avg_fp_rate: number;
  avg_safety_sharpe: number;
  avg_safety_mean: number;
  avg_max_compute_shift: number;
  best_certificate_hash: string | null;
  modalities_covered: string[] | null;
};

export type RegistryEntry = {
  rank: number;
  modelVersion: string;
  meshScore: number;
  totalRuns: number;
  latestRun: string;
  avgJailbreakRate: number;
  avgFpRate: number;
  avgSafetySharpe: number;
  avgSafetyMean: number;
  avgMaxComputeShift: number;
  certificateHash: string | null;
  tier: MeshTier;
  modalitiesCovered: string[];
};

// ---------------------------------------------------------------------------
// Mesh Score
// ---------------------------------------------------------------------------

/**
 * Mesh Score formula (0–1000):
 *   Base 1000
 *   - (jailbreakRate × 500)
 *   - (fpRate × 500)
 *   + (safetySharpe × 10)
 *
 * Clamped to [0, 1000].
 */
// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getRegistryLeaderboard(): Promise<RegistryEntry[]> {
  const rows = (await sql`
    with run_metrics as (
      select
        model_version,
        count(*)::int as total_runs,
        max(timestamp) as latest_run,
        round(avg(jailbreak_rate)::numeric, 4)::double precision as avg_jailbreak_rate,
        round(avg(fp_rate)::numeric, 4)::double precision as avg_fp_rate,
        round(avg(coalesce(safety_sharpe, 0))::numeric, 4)::double precision as avg_safety_sharpe,
        round(avg(coalesce(safety_mean, 0))::numeric, 4)::double precision as avg_safety_mean,
        round(avg(coalesce(max_compute_shift, 0))::numeric, 4)::double precision as avg_max_compute_shift,
        (
          select certificate_hash
          from redteam_runs r2
          where r2.model_version = redteam_runs.model_version
            and r2.certificate_hash is not null
          order by r2.timestamp desc
          limit 1
        ) as best_certificate_hash
      from redteam_runs
      group by model_version
    ),
    modality_metrics as (
      select
        runs.model_version,
        array_remove(
          array_agg(distinct coalesce(nullif(results.modality, ''), 'text')),
          null
        ) as modalities_covered
      from redteam_runs runs
      left join redteam_results results on results.run_id = runs.id
      group by runs.model_version
    )
    select
      run_metrics.model_version,
      run_metrics.total_runs,
      run_metrics.latest_run,
      run_metrics.avg_jailbreak_rate,
      run_metrics.avg_fp_rate,
      run_metrics.avg_safety_sharpe,
      run_metrics.avg_safety_mean,
      run_metrics.avg_max_compute_shift,
      run_metrics.best_certificate_hash,
      coalesce(modality_metrics.modalities_covered, array['text']::text[]) as modalities_covered
    from run_metrics
    left join modality_metrics on modality_metrics.model_version = run_metrics.model_version
  `) as RegistryRow[];

  const entries = rows.map((row) => {
    const modalitiesCovered = normalizeModalities(row.modalities_covered);
    const meshScore = calculateMeshScore(
      row.avg_jailbreak_rate,
      row.avg_fp_rate,
      row.avg_safety_sharpe,
      modalitiesCovered
    );

    return {
      rank: 0,
      modelVersion: row.model_version,
      meshScore,
      totalRuns: row.total_runs,
      latestRun: row.latest_run,
      avgJailbreakRate: row.avg_jailbreak_rate,
      avgFpRate: row.avg_fp_rate,
      avgSafetySharpe: row.avg_safety_sharpe,
      avgSafetyMean: row.avg_safety_mean,
      avgMaxComputeShift: row.avg_max_compute_shift,
      certificateHash: row.best_certificate_hash,
      tier: getMeshTier(meshScore),
      modalitiesCovered
    };
  });

  return entries
    .sort((left, right) => {
      if (right.meshScore !== left.meshScore) {
        return right.meshScore - left.meshScore;
      }

      if (right.totalRuns !== left.totalRuns) {
        return right.totalRuns - left.totalRuns;
      }

      return left.modelVersion.localeCompare(right.modelVersion);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
}

/**
 * Look up a specific run by its certificate hash.
 */
export async function lookupByCertificateHash(
  hash: string
): Promise<RegistryEntry | null> {
  const leaderboard = await getRegistryLeaderboard();
  const trimmed = hash.trim().toLowerCase();

  return (
    leaderboard.find(
      (entry) =>
        entry.certificateHash?.toLowerCase() === trimmed ||
        entry.certificateHash?.toLowerCase().startsWith(trimmed)
    ) ?? null
  );
}

function normalizeModalities(values: string[] | null | undefined) {
  const modalities = (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return modalities.length > 0 ? [...new Set(modalities)] : ["text"];
}
