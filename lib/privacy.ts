export const MAX_REGULATORY_EPSILON = 8.0;
export const MAX_REGULATORY_DELTA = 1e-5;

export type ExtractionAttackResult = {
  extractionSucceeded: boolean;
  isTrainingMember?: boolean;
  predictedMember?: boolean;
};

export type EmpiricalLeakageReport = {
  totalAttempts: number;
  successfulExtractions: number;
  extractionSuccessRate: number;
  membershipInferenceAdvantage: number | null;
  truePositiveRate: number | null;
  falsePositiveRate: number | null;
};

export type DifferentialPrivacyTrace = {
  epsilon: number;
  delta: number;
  accountant?: string;
};

export type DifferentialPrivacyVerification =
  | { status: "NOT_PROVABLE" }
  | {
      status: "NON_COMPLIANT";
      reason: "Privacy budget exceeds regulatory maximums.";
    }
  | { status: "COMPLIANT"; epsilon: number; delta: number };

/** A certificate-ready privacy result; empirical evidence never replaces DP proof. */
export type PrivacyAssessment = DifferentialPrivacyVerification & {
  empiricalLeakage?: EmpiricalLeakageReport;
};

/**
 * Calculates observed attack performance. MIA is TPR - FPR, and is left null
 * when the supplied experiment lacks either training members or non-members.
 */
export function evaluateEmpiricalLeakage(
  attackResults: readonly ExtractionAttackResult[],
): EmpiricalLeakageReport {
  const successfulExtractions = attackResults.filter(
    ({ extractionSucceeded }) => extractionSucceeded,
  ).length;
  const membershipOutcomes = attackResults.filter(
    ({ isTrainingMember, predictedMember }) =>
      typeof isTrainingMember === "boolean" && typeof predictedMember === "boolean",
  ) as Required<Pick<ExtractionAttackResult, "isTrainingMember" | "predictedMember">>[];
  const members = membershipOutcomes.filter(({ isTrainingMember }) => isTrainingMember);
  const nonMembers = membershipOutcomes.filter(
    ({ isTrainingMember }) => !isTrainingMember,
  );

  const truePositiveRate =
    members.length === 0
      ? null
      : members.filter(({ predictedMember }) => predictedMember).length / members.length;
  const falsePositiveRate =
    nonMembers.length === 0
      ? null
      : nonMembers.filter(({ predictedMember }) => predictedMember).length /
        nonMembers.length;

  return {
    totalAttempts: attackResults.length,
    successfulExtractions,
    extractionSuccessRate:
      attackResults.length === 0 ? 0 : successfulExtractions / attackResults.length,
    membershipInferenceAdvantage:
      truePositiveRate === null || falsePositiveRate === null
        ? null
        : truePositiveRate - falsePositiveRate,
    truePositiveRate,
    falsePositiveRate,
  };
}

/**
 * Confirms a supplied, finite privacy-accounting trace. It never estimates or
 * fabricates a privacy budget when formal training evidence is absent.
 */
export function verifyDifferentialPrivacy(
  dpTrace: DifferentialPrivacyTrace | null | undefined,
): DifferentialPrivacyVerification {
  if (
    !dpTrace ||
    !Number.isFinite(dpTrace.epsilon) ||
    !Number.isFinite(dpTrace.delta) ||
    dpTrace.epsilon < 0 ||
    dpTrace.delta < 0
  ) {
    return { status: "NOT_PROVABLE" };
  }

  if (
    dpTrace.epsilon > MAX_REGULATORY_EPSILON ||
    dpTrace.delta > MAX_REGULATORY_DELTA
  ) {
    return {
      status: "NON_COMPLIANT",
      reason: "Privacy budget exceeds regulatory maximums.",
    };
  }

  return {
    status: "COMPLIANT",
    epsilon: dpTrace.epsilon,
    delta: dpTrace.delta,
  };
}
