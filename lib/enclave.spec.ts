import { describe, expect, it } from "vitest";

import {
  ENCLAVE_COMPROMISE_ERROR,
  NitroEnclaveValidator,
  SOVEREIGN_NITRO_POLICY,
} from "@/lib/enclave";
import type { AttestationEvidence } from "@/lib/sovereign/types";

const evidence: AttestationEvidence = {
  provider: "nitro",
  sessionId: "audit-session-1",
  ...SOVEREIGN_NITRO_POLICY,
  imageDigest: "sha256:evaluator-image",
  sbomDigest: "sha256:sbom",
  signature: "base64-cose-signature",
  issuedAt: "2026-07-18T00:00:00.000Z",
};

describe("NitroEnclaveValidator", () => {
  it("accepts signed evidence matching every sovereign PCR", async () => {
    const validator = new NitroEnclaveValidator({ verify: async () => true });

    await expect(validator.verifyAttestation(evidence)).resolves.toBeUndefined();
  });

  it("fails closed for a PCR or signature mismatch", async () => {
    const validator = new NitroEnclaveValidator({ verify: async () => false });
    const pcrMismatch = { ...evidence, pcr1: "compromised" };

    await expect(validator.verifyAttestation(pcrMismatch)).rejects.toThrow(
      ENCLAVE_COMPROMISE_ERROR,
    );
    await expect(validator.verifyAttestation(evidence)).rejects.toThrow(
      ENCLAVE_COMPROMISE_ERROR,
    );
  });
});
