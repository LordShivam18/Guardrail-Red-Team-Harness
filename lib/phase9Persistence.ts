import { sql } from "./db";
import { persistSovereignIndex, type SovereignRunAssessment } from "./sovereign/persistence";
import type {
  ExpectedModalityOutcome,
  NormalisedRedteamResult,
  RedteamModality
} from "./normaliseResult";

export type RedteamResult = NormalisedRedteamResult & {
  id: string;
  runId: string;
  testId: string;
  promptText: string;
  rawOutput: string;
  finalOutput: string;
  modelVersion: string;
};

type PromptRow = {
  id: string;
};

type RunRow = {
  id: string;
  timestamp: string;
};

type ExistingResultRow = {
  id: string;
};

type PersistModalityResultInput = {
  runId?: string;
  modelVersion?: string;
  promptText: string;
  expectedOutcome: ExpectedModalityOutcome;
  category: string;
  sourceDataset: string;
  modality: RedteamModality;
  rawOutput: string;
  finalOutput: string;
  normalised: NormalisedRedteamResult;
};

type RunMetricsRow = {
  total_refusal: number;
  total_safe: number;
  failed_refusal: number;
  false_positive: number;
};

export const PHASE9_DEFAULT_MODEL_VERSION = "Gemini-2.0-Flash-Guarded-v1";

export async function createPhase9Run(
  modelVersion: string = process.env.PHASE9_MODEL_VERSION ?? PHASE9_DEFAULT_MODEL_VERSION
) {
  const rows = (await sql`
    insert into redteam_runs (
      model_version,
      jailbreak_rate,
      fp_rate,
      safety_mean,
      safety_variance,
      safety_sharpe
    )
    values (
      ${modelVersion},
      0,
      0,
      0,
      0,
      0
    )
    returning id, timestamp
  `) as RunRow[];
  const run = rows[0];

  if (!run) {
    throw new Error("Failed to create Phase 9 red-team run.");
  }

  return run;
}

export async function getOrCreatePhase9Run(
  modelVersion: string = process.env.PHASE9_MODEL_VERSION ?? PHASE9_DEFAULT_MODEL_VERSION
) {
  const rows = (await sql`
    select id, timestamp
    from redteam_runs
    where model_version = ${modelVersion}
      and timestamp >= now() - interval '12 hours'
    order by timestamp desc
    limit 1
  `) as RunRow[];
  const existing = rows[0];

  return existing ?? createPhase9Run(modelVersion);
}

export async function persistModalityResult(
  input: PersistModalityResultInput
): Promise<RedteamResult> {
  const runId = input.runId ?? (await createPhase9Run(input.modelVersion)).id;
  const promptId = await upsertAdversarialPrompt({
    promptText: input.promptText,
    expectedOutcome: input.expectedOutcome,
    category: input.category,
    sourceDataset: input.sourceDataset,
    modality: input.modality
  });

  const existingRows = (await sql`
    select id
    from redteam_results
    where run_id = ${runId}::uuid
      and test_id = ${promptId}::uuid
      and coalesce(modality, 'text') = ${input.modality}
    order by created_at asc, id asc
    limit 1
  `) as ExistingResultRow[];
  const existing = existingRows[0];
  const rows = existing
    ? ((await sql`
        update redteam_results
        set
          raw_output = ${input.rawOutput},
          final_output = ${input.finalOutput},
          blocked = ${input.normalised.blocked},
          outcome_flag = ${input.normalised.outcome}::outcome_flag,
          modality = ${input.modality},
          created_at = now()
        where id = ${existing.id}::uuid
        returning id
      `) as { id: string }[])
    : ((await sql`
    insert into redteam_results (
      run_id,
      test_id,
      raw_output,
      final_output,
      blocked,
      outcome_flag,
      modality
    )
    values (
      ${runId}::uuid,
      ${promptId}::uuid,
      ${input.rawOutput},
      ${input.finalOutput},
      ${input.normalised.blocked},
      ${input.normalised.outcome}::outcome_flag,
      ${input.modality}
    )
    returning id
  `) as { id: string }[]);
  const result = rows[0];

  if (!result) {
    throw new Error("Failed to persist Phase 9 red-team result.");
  }

  return {
    ...input.normalised,
    id: result.id,
    runId,
    testId: promptId,
    promptText: input.promptText,
    rawOutput: input.rawOutput,
    finalOutput: input.finalOutput,
    modelVersion: input.modelVersion ?? PHASE9_DEFAULT_MODEL_VERSION
  };
}

export async function refreshRunMetrics(
  runId: string,
  sovereignAssessment?: Omit<SovereignRunAssessment, "fuzzerStats">,
) {
  const rows = (await sql`
    select
      count(*) filter (where p.expected_outcome = 'refusal')::int as total_refusal,
      count(*) filter (where p.expected_outcome = 'safe')::int as total_safe,
      count(*) filter (
        where p.expected_outcome = 'refusal'
          and r.outcome_flag in ('FAILED', 'FN')
      )::int as failed_refusal,
      count(*) filter (
        where p.expected_outcome = 'safe'
          and r.outcome_flag = 'FP'
      )::int as false_positive
    from redteam_results r
    inner join adversarial_prompts p on p.id = r.test_id
    where r.run_id = ${runId}::uuid
  `) as RunMetricsRow[];
  const metrics = rows[0];

  if (!metrics) {
    return;
  }

  const jailbreakRate =
    metrics.total_refusal === 0 ? 0 : metrics.failed_refusal / metrics.total_refusal;
  const fpRate = metrics.total_safe === 0 ? 0 : metrics.false_positive / metrics.total_safe;

  await sql`
    update redteam_runs
    set
      jailbreak_rate = ${jailbreakRate},
      fp_rate = ${fpRate}
    where id = ${runId}::uuid
  `;

  if (sovereignAssessment) {
    return persistSovereignIndex(runId, {
      ...sovereignAssessment,
      fuzzerStats: { jailbreakRate },
    });
  }
}

async function upsertAdversarialPrompt(input: {
  promptText: string;
  expectedOutcome: ExpectedModalityOutcome;
  category: string;
  sourceDataset: string;
  modality: RedteamModality;
}) {
  const expectedOutcome = input.expectedOutcome === "blocked" ? "refusal" : "safe";
  const existingRows = (await sql`
    select id
    from adversarial_prompts
    where prompt_text = ${input.promptText}
      and source_dataset = ${input.sourceDataset}
    order by created_at asc, id asc
    limit 1
  `) as PromptRow[];
  const existing = existingRows[0];

  if (existing) {
    const updatedRows = (await sql`
      update adversarial_prompts
      set
        expected_outcome = ${expectedOutcome}::expected_outcome,
        category = ${input.category},
        modality = ${input.modality}
      where id = ${existing.id}::uuid
      returning id
    `) as PromptRow[];

    return updatedRows[0]?.id ?? existing.id;
  }

  const insertedRows = (await sql`
    insert into adversarial_prompts (
      prompt_text,
      expected_outcome,
      category,
      source_dataset,
      modality
    )
    values (
      ${input.promptText},
      ${expectedOutcome}::expected_outcome,
      ${input.category},
      ${input.sourceDataset},
      ${input.modality}
    )
    returning id
  `) as PromptRow[];
  const inserted = insertedRows[0];

  if (!inserted) {
    throw new Error("Failed to upsert Phase 9 adversarial prompt.");
  }

  return inserted.id;
}
