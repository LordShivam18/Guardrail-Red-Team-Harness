import { describe, expect, it } from "vitest";
import { verifyRandomizedSmoothing } from "@/lib/robustness";

const scope = {
  tokenizerDigest: "sha256:test-tokenizer",
  representation: "embedding-l2" as const,
  sampleCount: 1_000,
  alpha: 0.001
};

describe("verifyRandomizedSmoothing", () => {
  it("certifies a statistically dominant refusal class", () => {
    const certificate = verifyRandomizedSmoothing({
      sampleCount: 1_000,
      alpha: 0.001,
      countA: 980,
      countB: 10,
      noiseStandardDeviation: 0.5,
      scope
    });

    expect(certificate.decision).toBe("CERTIFIED");
    expect(certificate.pA).toBeGreaterThan(certificate.pB);
    expect(certificate.epsilonRadius).toBeGreaterThan(0);
  });

  it("abstains when confidence intervals cannot separate the classes", () => {
    const certificate = verifyRandomizedSmoothing({
      sampleCount: 20,
      alpha: 0.001,
      countA: 11,
      countB: 9,
      scope: { ...scope, sampleCount: 20 }
    });

    expect(certificate).toMatchObject({ decision: "ABSTAIN", epsilonRadius: null });
  });
});
