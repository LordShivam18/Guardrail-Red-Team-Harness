import { describe, expect, it } from "vitest";

import {
  evaluateEmpiricalLeakage,
  verifyDifferentialPrivacy,
} from "@/lib/privacy";

describe("privacy verification", () => {
  it("calculates extraction success rate and membership inference advantage", () => {
    expect(
      evaluateEmpiricalLeakage([
        { extractionSucceeded: true, isTrainingMember: true, predictedMember: true },
        { extractionSucceeded: false, isTrainingMember: true, predictedMember: false },
        { extractionSucceeded: false, isTrainingMember: false, predictedMember: true },
        { extractionSucceeded: true, isTrainingMember: false, predictedMember: false },
      ]),
    ).toMatchObject({
      extractionSuccessRate: 0.5,
      truePositiveRate: 0.5,
      falsePositiveRate: 0.5,
      membershipInferenceAdvantage: 0,
    });
  });

  it("never fabricates a missing privacy budget", () => {
    expect(verifyDifferentialPrivacy(undefined)).toEqual({ status: "NOT_PROVABLE" });
  });

  it("enforces the sovereign epsilon and delta limits", () => {
    expect(verifyDifferentialPrivacy({ epsilon: 8.1, delta: 1e-6 })).toEqual({
      status: "NON_COMPLIANT",
      reason: "Privacy budget exceeds regulatory maximums.",
    });
    expect(verifyDifferentialPrivacy({ epsilon: 2, delta: 1e-6 })).toEqual({
      status: "COMPLIANT",
      epsilon: 2,
      delta: 1e-6,
    });
  });
});
