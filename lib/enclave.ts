import { timingSafeEqual } from "crypto";

import type { AttestationEvidence } from "@/lib/sovereign/types";

export const ENCLAVE_COMPROMISE_ERROR =
  "Enclave compromise detected: Platform Configuration Registers do not match the sovereign policy.";

/** The approved measurements for the sovereign Nitro evaluation image. */
export type EnclavePolicy = {
  pcr0: string;
  pcr1: string;
  pcr2: string;
};

export type EnclaveSession = {
  id: string;
  publicKey: string;
  createdAt: string;
};

export type SealedInput = {
  ciphertext: string;
  algorithm: string;
  digest: string;
};

export interface EnclaveProvider {
  createSession(): Promise<EnclaveSession>;
  verifyAttestation(_evidence: AttestationEvidence): Promise<void>;
  releaseSealedInput(_session: EnclaveSession, _input: SealedInput): Promise<void>;
}

/**
 * Validates the COSE signature and AWS Nitro attestation certificate chain.
 * The concrete implementation belongs at the deployment boundary, where its
 * trust anchors can be managed by the regulatory authority.
 */
export interface AttestationSignatureVerifier {
  verify(_evidence: AttestationEvidence): Promise<boolean>;
}

/**
 * Release-controlled PCR values. Production releases must replace these with
 * the values from the signed sovereign evaluator release manifest.
 */
export const SOVEREIGN_NITRO_POLICY: EnclavePolicy = {
  pcr0: "ad1d312462349a0f2572ed42f41829bf83b6bd61cd60c1e2eaa833bcc0de34aa6c6dac9c7a9c60d571baa6e35a7c3e15",
  pcr1: "b8aab2a6852fc6f3df9d3f2e50eec3ef92158eae2810f5590ce8e31d32a81e3778d0e6cb197854d10b1739615f7bc5c3",
  pcr2: "4f3048ef6ee9401da81617f9c94d6e1bc18d052c8cbb063b5e20dc381af6c7cbd5c7a42b63230551a6fb24db990b1c48",
};

const constantTimeEqual = (received: string, expected: string): boolean => {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
};

/**
 * A structural validator for Nitro attestation. It deliberately has no
 * permissive default signature verifier: a verifier must be supplied by the
 * caller, otherwise attestation validation fails closed.
 */
export class NitroEnclaveValidator
  implements Pick<EnclaveProvider, "verifyAttestation">
{
  private readonly signatureVerifier: AttestationSignatureVerifier;
  private readonly policy: EnclavePolicy;

  constructor(
    _signatureVerifier: AttestationSignatureVerifier,
    _policy: EnclavePolicy = SOVEREIGN_NITRO_POLICY,
  ) {
    this.signatureVerifier = _signatureVerifier;
    this.policy = _policy;
  }

  async verifyAttestation(evidence: AttestationEvidence): Promise<void> {
    try {
      const signatureIsValid = await this.signatureVerifier.verify(evidence);
      const pcrsMatch =
        evidence.provider === "nitro" &&
        constantTimeEqual(evidence.pcr0, this.policy.pcr0) &&
        constantTimeEqual(evidence.pcr1, this.policy.pcr1) &&
        constantTimeEqual(evidence.pcr2, this.policy.pcr2);

      if (!signatureIsValid || !pcrsMatch) {
        throw new Error(ENCLAVE_COMPROMISE_ERROR);
      }
    } catch {
      // Do not reveal whether a signature or a particular PCR was invalid.
      throw new Error(ENCLAVE_COMPROMISE_ERROR);
    }
  }
}
