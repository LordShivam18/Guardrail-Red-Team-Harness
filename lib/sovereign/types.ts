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
