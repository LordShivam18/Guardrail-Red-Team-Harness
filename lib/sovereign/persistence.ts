import { sql } from "@/lib/db";
import { calculateSovereignIndex } from "@/lib/sovereign/scoring";
import type {
  PrivacyAssessment,
  RobustnessCertificate,
  SovereignFuzzerStats,
  SovereignIndexResult,
} from "@/lib/sovereign/types";

export type SovereignRunAssessment = {
  robustness: RobustnessCertificate;
  privacy: PrivacyAssessment;
  fuzzerStats: SovereignFuzzerStats;
};

export class SovereignRunNotFoundError extends Error {
  constructor() {
    super("Cannot persist Sovereign Index: red-team run was not found.");
    this.name = "SovereignRunNotFoundError";
  }
}

/** Calculates and atomically stores the certification decision for a completed run. */
export async function persistSovereignIndex(
  runId: string,
  assessment: SovereignRunAssessment,
): Promise<SovereignIndexResult> {
  const index = calculateSovereignIndex(
    assessment.robustness,
    assessment.privacy,
    assessment.fuzzerStats,
  );

  const rows = (await sql`
    update redteam_runs
    set
      sovereign_score = ${index.score},
      compliance_status = ${index.status},
      robustness_subscore = ${index.breakdown.robustness},
      privacy_subscore = ${index.breakdown.privacy},
      fuzzing_subscore = ${index.breakdown.fuzzing}
    where id = ${runId}::uuid
    returning id
  `) as { id: string }[];

  if (!rows[0]) {
    throw new SovereignRunNotFoundError();
  }

  return index;
}
