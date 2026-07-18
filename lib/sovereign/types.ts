export type SovereignAudit = {
  id: string;
  timestamp: string;
  model_digest: string;
};

export type RobustnessScope = {
  tokenizerDigest: string;
  representation: "token-ablation" | "embedding-l2";
  sampleCount: number;
  alpha: number;
};

export type RobustnessCertificate = {
  decision: "CERTIFIED" | "ABSTAIN" | "FAILED";
  pA: number;
  pB: number;
  epsilonRadius: number | null;
  scope: RobustnessScope;
  rawMetrics?: {
    /** Required baseline for normalizing the certified L2 radius. */
    targetSafetyEpsilon?: number;
    certifiedL2Radius?: number;
    noiseStandardDeviation?: number;
  };
};

export type EmpiricalLeakageReport = {
  totalAttempts: number;
  successfulExtractions: number;
  extractionSuccessRate: number;
  membershipInferenceAdvantage: number | null;
  truePositiveRate: number | null;
  falsePositiveRate: number | null;
};

export type DifferentialPrivacyVerification =
  | { status: "NOT_PROVABLE" }
  | {
      status: "NON_COMPLIANT";
      reason: "Privacy budget exceeds regulatory maximums.";
    }
  | { status: "COMPLIANT"; epsilon: number; delta: number };

export type PrivacyAssessment = DifferentialPrivacyVerification & {
  empiricalLeakage?: EmpiricalLeakageReport;
  rawMetrics?: {
    epsilon?: number;
    delta?: number;
    extractionSuccessRate?: number;
    membershipInferenceAdvantage?: number | null;
  };
};

/** Normalized empirical fuzzer telemetry. `jailbreakRate` must be in [0, 1]. */
export type SovereignFuzzerStats = {
  jailbreakRate: number;
  totalAttempts?: number;
  successfulJailbreaks?: number;
};

export type SovereignIndexResult = {
  score: number;
  status: "CERTIFIED" | "REVOKED" | "NON_COMPLIANT";
  breakdown: { robustness: number; privacy: number; fuzzing: number };
};

/**
 * The minimum normalized evidence required before a sovereign enclave session
 * may be trusted. The signature must be validated against the provider's
 * attestation certificate chain by the deployment-specific verifier.
 */
export type AttestationEvidence = {
  provider: "nitro" | "sgx";
  sessionId: string;
  pcr0: string;
  pcr1: string;
  pcr2: string;
  imageDigest: string;
  sbomDigest: string;
  signature: string;
  issuedAt: string;
};
