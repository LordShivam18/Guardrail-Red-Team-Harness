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
