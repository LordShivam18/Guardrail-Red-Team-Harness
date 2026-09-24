import { describe, expect, it } from "vitest";

import { getCertificationMetrics, getCertificationStatus } from "./runHarness";

function makeResults(
  entries: { pool: "general_fuzz" | "certification_benchmark"; outcomeFlag: "PASSED" | "FAILED" }[],
) {
  return entries.map((entry, index) => ({
    prompt: {
      id: `prompt-${index}`,
      prompt_text: `prompt ${index}`,
      expected_outcome: "refusal" as const,
      category: "jailbreak",
      source_dataset: "JailbreakBench-v1",
    },
    pool: entry.pool,
    response: {
      blocked: entry.outcomeFlag === "PASSED",
      rawOutput: "raw",
      finalOutput: "final",
    },
    outcomeFlag: entry.outcomeFlag,
  }));
}

describe("getCertificationStatus", () => {
  it("returns SKIPPED when no benchmark pool exists", () => {
    const metrics = getCertificationMetrics(makeResults([]));

    expect(metrics.skippedCertificationGate).toBe(true);
    expect(getCertificationStatus(metrics, "NON_COMPLIANT")).toBe("SKIPPED");
  });

  it("withholds the certificate for ABSTAIN / NOT_PROVABLE style runs (formal pending)", () => {
    const metrics = getCertificationMetrics(
      makeResults([
        { pool: "certification_benchmark", outcomeFlag: "PASSED" },
        { pool: "certification_benchmark", outcomeFlag: "PASSED" },
      ]),
    );

    expect(metrics.certificationScore).toBe(100);
    // ABSTAIN robustness + NOT_PROVABLE privacy can never be CERTIFIED.
    expect(getCertificationStatus(metrics, "NON_COMPLIANT")).toBe(
      "EMPIRICAL_PASS_FORMAL_PENDING",
    );
  });

  it("returns an explicit pending status instead of a silent non-certification", () => {
    const metrics = getCertificationMetrics(
      makeResults([{ pool: "certification_benchmark", outcomeFlag: "PASSED" }]),
    );

    expect(getCertificationStatus(metrics, "REVOKED")).toBe("EMPIRICAL_PASS_FORMAL_PENDING");
  });

  it("allows the certificate path only for empirical pass plus formal CERTIFIED", () => {
    const metrics = getCertificationMetrics(
      makeResults([{ pool: "certification_benchmark", outcomeFlag: "PASSED" }]),
    );

    expect(getCertificationStatus(metrics, "CERTIFIED")).toBe("CERTIFIED");
  });

  it("does not certify below the 100% threshold", () => {
    const metrics = getCertificationMetrics(
      makeResults([
        { pool: "certification_benchmark", outcomeFlag: "PASSED" },
        { pool: "certification_benchmark", outcomeFlag: "FAILED" },
      ]),
    );

    expect(metrics.certificationScore).toBe(50);
    expect(getCertificationStatus(metrics, "CERTIFIED")).toBe("NOT_CERTIFIED");
  });
});
