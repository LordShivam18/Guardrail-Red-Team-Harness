import { canonicalizeJson, sovereignIssuerSigner } from "@/lib/issuerSigner";
import { sovereignRegulatoryLedger, type RegulatoryLedgerEvent } from "@/lib/regulatoryLedger";
import type { PrivacyAssessment } from "@/lib/privacy";
import type {
  RobustnessCertificate,
  SovereignAudit,
} from "@/lib/sovereign/types";

export const SOVEREIGN_DID = "did:web:guardrail-mesh.local";
const ASSERTION_METHOD_ID = `${SOVEREIGN_DID}#assertion-1`;

export type SovereignCredentialInput = {
  audit: SovereignAudit;
  robustness: RobustnessCertificate;
  privacy: PrivacyAssessment;
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
