import { describe, expect, it } from "vitest";

import { issueSovereignCredential, SOVEREIGN_DID } from "@/lib/credential";
import { RegulatoryLedger } from "@/lib/regulatoryLedger";

const audit = {
  id: "audit-001",
  timestamp: "2026-07-18T00:00:00.000Z",
  model_digest: "sha256:approved-model",
};
const robustness = {
  decision: "CERTIFIED" as const,
  pA: 0.95,
  pB: 0.02,
  epsilonRadius: 0.7,
  scope: {
    tokenizerDigest: "sha256:tokenizer",
    representation: "embedding-l2" as const,
    sampleCount: 10_000,
    alpha: 0.001,
  },
  rawMetrics: {
    targetSafetyEpsilon: 0.7,
    certifiedL2Radius: 0.7,
  },
};

describe("sovereign credentials and ledger", () => {
  it("issues a W3C VC 2.0 assertion with a proof and ledger event", async () => {
    const issued = await issueSovereignCredential({
      audit,
      robustness,
      privacy: { status: "COMPLIANT", epsilon: 3, delta: 1e-6 },
      fuzzerStats: { jailbreakRate: 0.1, totalAttempts: 1_000 },
    });

    expect(issued.credential).toMatchObject({
      "@context": ["https://www.w3.org/ns/credentials/v2"],
      type: ["VerifiableCredential", "SovereignAIAudit"],
      issuer: SOVEREIGN_DID,
      credentialSubject: {
        sovereign_score: 86,
        compliance_breakdown: {
          robustness: 30,
          privacy: 15.63,
          fuzzing: 40.5,
        },
        assertion_status: "VERIFIED",
      },
      proof: { proofPurpose: "assertionMethod", verificationMethod: `${SOVEREIGN_DID}#assertion-1` },
    });
    expect(issued.credential.proof.proofValue).not.toHaveLength(0);
    expect(issued.ledgerEvent.credential_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("chains each append to the prior event hash", () => {
    const ledger = new RegulatoryLedger();
    const first = ledger.append({ id: "first" }, "2026-07-18T00:00:00.000Z");
    const second = ledger.append({ id: "second" }, "2026-07-18T00:01:00.000Z");

    expect(first.previous_event_hash).toBeNull();
    expect(second.previous_event_hash).toBe(first.event_hash);
    expect(second.merkle_root).not.toBe(first.merkle_root);
  });

  it("marks a below-threshold signed assertion as revoked", async () => {
    const issued = await issueSovereignCredential({
      audit: { ...audit, id: "audit-revoked" },
      robustness,
      privacy: { status: "NON_COMPLIANT", reason: "Privacy budget exceeds regulatory maximums." },
      fuzzerStats: { jailbreakRate: 0 },
    });

    expect(issued.credential.credentialSubject).toMatchObject({
      sovereign_score: 0,
      assertion_status: "REVOKED",
    });
  });
});
