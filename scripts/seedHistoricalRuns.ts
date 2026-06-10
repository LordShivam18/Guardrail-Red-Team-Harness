import { createHash } from "node:crypto";
import { loadLocalEnv } from "./env";

const DAY_MS = 24 * 60 * 60 * 1000;
const NEON_RETRY_DELAYS_MS = [1_000, 3_000, 7_000];

type HistoricalRunSeed = {
  daysAgo: number;
  modelVersion: string;
  jailbreakRate: number;
  fpRate: number;
  safetyMean: number;
  safetyVariance: number;
  safetySharpe: number;
  maxComputeShift: number;
};

type SeededRunRow = {
  id: string;
  timestamp: string;
  model_version: string;
  jailbreak_rate: number;
  fp_rate: number;
};

const HISTORICAL_RUNS: HistoricalRunSeed[] = [
  {
    daysAgo: 14,
    modelVersion: "Gemini-2.0-Flash-Guarded-v1",
    jailbreakRate: 0.23,
    fpRate: 0.08,
    safetyMean: 0.81,
    safetyVariance: 0.021,
    safetySharpe: 0.42,
    maxComputeShift: 1.2
  },
  {
    daysAgo: 12,
    modelVersion: "Gemini-2.0-Flash-Guarded-v1",
    jailbreakRate: 0.2,
    fpRate: 0.07,
    safetyMean: 0.84,
    safetyVariance: 0.018,
    safetySharpe: 0.71,
    maxComputeShift: 1.1
  },
  {
    daysAgo: 10,
    modelVersion: "Gemini-2.0-Flash-Guarded-v1",
    jailbreakRate: 0.17,
    fpRate: 0.06,
    safetyMean: 0.87,
    safetyVariance: 0.014,
    safetySharpe: 1.03,
    maxComputeShift: 0.9
  },
  {
    daysAgo: 8,
    modelVersion: "Atlas-34B-Mesh",
    jailbreakRate: 0.11,
    fpRate: 0.04,
    safetyMean: 0.91,
    safetyVariance: 0.009,
    safetySharpe: 1.41,
    maxComputeShift: 0.8
  },
  {
    daysAgo: 7,
    modelVersion: "Gemini-2.0-Flash-Guarded-v1",
    jailbreakRate: 0.13,
    fpRate: 0.045,
    safetyMean: 0.9,
    safetyVariance: 0.011,
    safetySharpe: 1.24,
    maxComputeShift: 1
  },
  {
    daysAgo: 5,
    modelVersion: "OpenGuard-8B",
    jailbreakRate: 0.18,
    fpRate: 0.05,
    safetyMean: 0.86,
    safetyVariance: 0.016,
    safetySharpe: 0.88,
    maxComputeShift: 1.4
  },
  {
    daysAgo: 4,
    modelVersion: "Gemini-2.0-Flash-Guarded-v1",
    jailbreakRate: 0.09,
    fpRate: 0.035,
    safetyMean: 0.93,
    safetyVariance: 0.007,
    safetySharpe: 1.69,
    maxComputeShift: 0.7
  },
  {
    daysAgo: 3,
    modelVersion: "Atlas-34B-Mesh",
    jailbreakRate: 0.07,
    fpRate: 0.03,
    safetyMean: 0.94,
    safetyVariance: 0.006,
    safetySharpe: 1.86,
    maxComputeShift: 0.6
  },
  {
    daysAgo: 1,
    modelVersion: "Sentinel-70B",
    jailbreakRate: 0.05,
    fpRate: 0.015,
    safetyMean: 0.97,
    safetyVariance: 0.003,
    safetySharpe: 2.22,
    maxComputeShift: 0.4
  },
  {
    daysAgo: 0,
    modelVersion: "Gemini-2.0-Flash-Guarded-v1",
    jailbreakRate: 0.06,
    fpRate: 0.02,
    safetyMean: 0.96,
    safetyVariance: 0.004,
    safetySharpe: 2.05,
    maxComputeShift: 0.5
  }
];

async function main() {
  loadLocalEnv();
  const { assertRequiredTablesExist, sql } = await import("../lib/db");

  await assertRequiredTablesExist(["redteam_runs"]);
  await withNeonRetry(() => sql`
    alter table redteam_runs
    add column if not exists certificate_hash text
  `);
  await withNeonRetry(() => sql`
    create unique index if not exists redteam_runs_certificate_hash_idx
      on redteam_runs(certificate_hash)
      where certificate_hash is not null
  `);

  const baseDate = getSeedBaseDate();
  console.log(`[seed-history] Seeding ${HISTORICAL_RUNS.length} historical red-team runs.`);

  for (const [index, run] of HISTORICAL_RUNS.entries()) {
    const timestamp = new Date(baseDate.getTime() - run.daysAgo * DAY_MS).toISOString();
    const certificateHash = getCertificateHash(run, timestamp);
    const rows = (await withNeonRetry(() => sql`
      insert into redteam_runs (
        timestamp,
        model_version,
        jailbreak_rate,
        fp_rate,
        safety_mean,
        safety_variance,
        safety_sharpe,
        max_compute_shift,
        certificate_hash
      )
      values (
        ${timestamp},
        ${run.modelVersion},
        ${run.jailbreakRate},
        ${run.fpRate},
        ${run.safetyMean},
        ${run.safetyVariance},
        ${run.safetySharpe},
        ${run.maxComputeShift},
        ${certificateHash}
      )
      on conflict (certificate_hash)
        where certificate_hash is not null
        do update set
          timestamp = excluded.timestamp,
          model_version = excluded.model_version,
          jailbreak_rate = excluded.jailbreak_rate,
          fp_rate = excluded.fp_rate,
          safety_mean = excluded.safety_mean,
          safety_variance = excluded.safety_variance,
          safety_sharpe = excluded.safety_sharpe,
          max_compute_shift = excluded.max_compute_shift
      returning id, timestamp, model_version, jailbreak_rate, fp_rate
    `)) as SeededRunRow[];
    const seeded = rows[0];

    if (!seeded) {
      throw new Error(`No row returned while seeding historical run ${index + 1}.`);
    }

    console.log(
      `[seed-history] ${index + 1}/${HISTORICAL_RUNS.length} ${seeded.model_version} ${seeded.timestamp} jailbreak=${seeded.jailbreak_rate.toFixed(
        3
      )} fp=${seeded.fp_rate.toFixed(3)}`
    );
  }

  console.log("[seed-history] Historical run seed complete.");
}

function getSeedBaseDate() {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  return date;
}

function getCertificateHash(run: HistoricalRunSeed, timestamp: string) {
  return createHash("sha256")
    .update(
      [
        "seed-history",
        run.modelVersion,
        timestamp,
        run.jailbreakRate,
        run.fpRate,
        run.safetySharpe
      ].join(":")
    )
    .digest("hex");
}

async function withNeonRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= NEON_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = NEON_RETRY_DELAYS_MS[attempt];

      if (!delayMs || !isRetryableNeonError(error)) {
        throw error;
      }

      console.warn(
        `[neon] Retryable database error on attempt ${attempt + 1}. Sleeping ${delayMs}ms before retry.`
      );
      await sleep(delayMs);
    }
  }

  throw new Error("Neon retry loop exited unexpectedly.");
}

function isRetryableNeonError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /fetch failed|timeout|timed out|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|connection/i.test(
    message
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[seed-history] Failed to seed historical runs.");
  console.error(error);
  process.exitCode = 1;
});
