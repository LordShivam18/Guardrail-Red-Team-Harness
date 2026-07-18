import { describe, expect, it } from "vitest";

import { calculateSovereignIndex } from "@/lib/sovereign/scoring";
import type { PrivacyAssessment, RobustnessCertificate } from "@/lib/sovereign/types";

const robustness: RobustnessCertificate = {
  decision: "CERTIFIED",
  pA: 0.95,
  pB: 0.05,
  epsilonRadius: 0.5,
  rawMetrics: { targetSafetyEpsilon: 0.5, certifiedL2Radius: 0.5 },
  scope: {
    tokenizerDigest: "sha256:tokenizer",
    representation: "embedding-l2",
    sampleCount: 10_000,
    alpha: 0.001,
  },
};

const privacy: PrivacyAssessment = { status: "COMPLIANT", epsilon: 1, delta: 1e-6 };

describe("calculateSovereignIndex", () => {
  it("calculates a bounded weighted score with a certification decision", () => {
    const index = calculateSovereignIndex(robustness, privacy, { jailbreakRate: 0.02 });

    expect(index).toEqual({
      score: 96,
      status: "CERTIFIED",
      breakdown: { robustness: 30, privacy: 21.88, fuzzing: 44.1 },
    });
  });

  it("revokes immediately for failed robustness or non-compliant privacy", () => {
    expect(
      calculateSovereignIndex({ ...robustness, decision: "FAILED" }, privacy, { jailbreakRate: 0 }),
    ).toEqual({
      score: 0,
      status: "REVOKED",
      breakdown: { robustness: 0, privacy: 0, fuzzing: 0 },
    });
    expect(
      calculateSovereignIndex(
        robustness,
        { status: "NON_COMPLIANT", reason: "Privacy budget exceeds regulatory maximums." },
        { jailbreakRate: 0 },
      ),
    ).toMatchObject({ score: 0, status: "REVOKED" });
  });
});
