"use client";

import type { AttestationEvidence, RobustnessCertificate, SovereignAudit } from "@/lib/sovereign/types";
import type { PrivacyAssessment } from "@/lib/privacy";

type SovereignAuditPanelProps = {
  audit: SovereignAudit;
  robustness: RobustnessCertificate;
  privacy: PrivacyAssessment;
  attestation: Pick<AttestationEvidence, "pcr0" | "pcr1" | "pcr2">;
  issuer?: string;
};

const statusClass = (status: string) => {
  if (status === "VERIFIED" || status === "CERTIFIED" || status === "COMPLIANT") {
    return "bg-white text-black";
  }
  if (status === "ABSTAIN" || status === "PENDING" || status === "NOT_PROVABLE") {
    return "bg-amber-400 text-black";
  }
  return "bg-red-900 text-red-100";
};

const privacyStatus = (privacy: PrivacyAssessment) => privacy.status;

/** Audit metadata only. This component intentionally has no model-weight or prompt fields. */
export default function SovereignAuditPanel({
  audit,
  robustness,
  privacy,
  attestation,
  issuer = "did:web:guardrail-mesh.local",
}: SovereignAuditPanelProps) {
  const rows = [
    ["DID ISSUER", issuer],
    ["AUDIT ID", audit.id],
    ["ROBUSTNESS", robustness.decision],
    ["EPSILON RADIUS", robustness.epsilonRadius?.toFixed(6) ?? "NOT CERTIFIED"],
    ["PRIVACY", privacyStatus(privacy)],
    ["DP EPSILON", privacy.status === "COMPLIANT" ? String(privacy.epsilon) : "NOT PROVABLE"],
    ["PCR0 / OS", attestation.pcr0],
    ["PCR1 / KERNEL", attestation.pcr1],
    ["PCR2 / EVALUATOR", attestation.pcr2],
  ] as const;

  return (
    <section className="bg-black font-mono text-white border border-neutral-800">
      <div className="border-b border-neutral-800 px-4 py-3 text-xs tracking-[0.2em]">
        SOVEREIGN AUDIT // {audit.timestamp}
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-[13rem_1fr]">
        {rows.map(([label, value]) => {
          const isStatus = label === "ROBUSTNESS" || label === "PRIVACY";
          return (
            <div className="contents" key={label}>
              <dt className="border-b border-r border-neutral-800 px-4 py-3 text-xs text-neutral-400">
                {label}
              </dt>
              <dd className="min-w-0 border-b border-neutral-800 px-4 py-3 text-xs break-all">
                {isStatus ? (
                  <span className={`inline-block px-2 py-1 text-[10px] font-bold ${statusClass(value)}`}>
                    {value}
                  </span>
                ) : (
                  value
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
