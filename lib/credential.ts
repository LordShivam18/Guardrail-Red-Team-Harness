import { canonicalizeJson, sovereignIssuerSigner } from "@/lib/issuerSigner";
import { sovereignRegulatoryLedger, type RegulatoryLedgerEvent } from "@/lib/regulatoryLedger";
import {
  calculateSovereignIndex,
  SOVEREIGN_INDEX_PASSING_SCORE,
} from "@/lib/sovereign/scoring";
import type {
  PrivacyAssessment,
  RobustnessCertificate,
  SovereignAudit,
  SovereignFuzzerStats,
  SovereignIndexResult,
} from "@/lib/sovereign/types";

export const SOVEREIGN_DID = "did:web:guardrail-mesh.local";
const ASSERTION_METHOD_ID = `${SOVEREIGN_DID}#assertion-1`;

export type SovereignCredentialInput = {
  audit: SovereignAudit;
  robustness: RobustnessCertificate;
  privacy: PrivacyAssessment;
  fuzzerStats: SovereignFuzzerStats;
  credentialSubjectId?: string;
};

export type SovereignVerifiableCredential = {
  "@context": readonly ["https://www.w3.org/ns/credentials/v2"];
  id: string;
  type: readonly ["VerifiableCredential", "SovereignAIAudit"];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: "SovereignAIModelAudit";
    audit: SovereignAudit;
    robustness: RobustnessCertificate;
    privacy: PrivacyAssessment;
    fuzzer: SovereignFuzzerStats;
    sovereign_score: number;
    compliance_breakdown: SovereignIndexResult["breakdown"];
    assertion_status: "VERIFIED" | "REVOKED";
    mandatory_passing_threshold: number;
  };
  proof: {
    type: "DataIntegrityProof";
    cryptosuite: "ecdsa-jcs-2019";
    created: string;
    proofPurpose: "assertionMethod";
    verificationMethod: string;
    proofValue: string;
  };
};

export type IssuedSovereignCredential = {
  credential: SovereignVerifiableCredential;
  ledgerEvent: RegulatoryLedgerEvent;
};

/** Issues, signs, and records an immutable regulatory audit credential. */
export async function issueSovereignCredential(
  auditData: SovereignCredentialInput,
): Promise<IssuedSovereignCredential> {
  const issuanceDate = new Date().toISOString();
  const sovereignIndex = calculateSovereignIndex(
    auditData.robustness,
    auditData.privacy,
    auditData.fuzzerStats,
  );
  const assertionStatus: "VERIFIED" | "REVOKED" =
    sovereignIndex.score >= SOVEREIGN_INDEX_PASSING_SCORE ? "VERIFIED" : "REVOKED";
  const unsignedCredential = {
    "@context": ["https://www.w3.org/ns/credentials/v2"] as const,
    id: `urn:guardrail-mesh:credential:${auditData.audit.id}`,
    type: ["VerifiableCredential", "SovereignAIAudit"] as const,
    issuer: SOVEREIGN_DID,
    issuanceDate,
    credentialSubject: {
      id: auditData.credentialSubjectId ?? `urn:guardrail-mesh:audit:${auditData.audit.id}`,
      type: "SovereignAIModelAudit" as const,
      audit: auditData.audit,
      robustness: auditData.robustness,
      privacy: auditData.privacy,
      fuzzer: auditData.fuzzerStats,
      sovereign_score: sovereignIndex.score,
      compliance_breakdown: sovereignIndex.breakdown,
      assertion_status: assertionStatus,
      mandatory_passing_threshold: SOVEREIGN_INDEX_PASSING_SCORE,
    },
  };
  const signature = await sovereignIssuerSigner.signDigest(canonicalizeJson(unsignedCredential));
  const credential: SovereignVerifiableCredential = {
    ...unsignedCredential,
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "ecdsa-jcs-2019",
      created: issuanceDate,
      proofPurpose: "assertionMethod",
      verificationMethod: ASSERTION_METHOD_ID,
      proofValue: signature,
    },
  };

  return {
    credential,
    ledgerEvent: sovereignRegulatoryLedger.append(credential, issuanceDate),
  };
}
