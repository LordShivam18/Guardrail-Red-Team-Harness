"use client";

import { calculateSovereignIndex } from "@/lib/sovereign/scoring";
import type {
  AttestationEvidence,
  PrivacyAssessment,
  RobustnessCertificate,
  SovereignAudit,
  SovereignFuzzerStats,
  SovereignIndexResult,
} from "@/lib/sovereign/types";

type SovereignAuditPanelProps = {
  audit: SovereignAudit;
  robustness: RobustnessCertificate;
  privacy: PrivacyAssessment;
  fuzzerStats: SovereignFuzzerStats;
  attestation: Pick<AttestationEvidence, "pcr0" | "pcr1" | "pcr2">;
  issuer?: string;
  sovereignIndex?: SovereignIndexResult;
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

const scoreClass = (score: number) => {
  if (score >= 85) return "border-white bg-black text-white";
  if (score > 0) return "border-amber-500 bg-amber-400 text-black";
  return "border-red-800 bg-red-950 text-red-200";
};

/** Audit metadata only. This component intentionally has no model-weight or prompt fields. */
export default function SovereignAuditPanel({
  audit,
  robustness,
  privacy,
  fuzzerStats,
  attestation,
  issuer = "did:web:guardrail-mesh.local",
  sovereignIndex,
}: SovereignAuditPanelProps) {
  const index = sovereignIndex ?? calculateSovereignIndex(robustness, privacy, fuzzerStats);
  const rows = [
    ["DID ISSUER", issuer],
    ["AUDIT ID", audit.id],
    ["ROBUSTNESS", robustness.decision],
    ["EPSILON RADIUS", robustness.epsilonRadius?.toFixed(6) ?? "NOT CERTIFIED"],
    ["PRIVACY", privacyStatus(privacy)],
    ["DP EPSILON", privacy.status === "COMPLIANT" ? String(privacy.epsilon) : "NOT PROVABLE"],
    ["FUZZING RESISTANCE", `${((1 - fuzzerStats.jailbreakRate) * 100).toFixed(1)}%`],
    ["PCR0 / OS", attestation.pcr0],
    ["PCR1 / KERNEL", attestation.pcr1],
    ["PCR2 / EVALUATOR", attestation.pcr2],
  ] as const;

  return (
    <section className="bg-black font-mono text-white border border-neutral-800">
      <div className="border-b border-neutral-800 px-4 py-3 text-xs tracking-[0.2em]">
        SOVEREIGN AUDIT // {audit.timestamp}
      </div>
      <div className={`border-b p-5 ${scoreClass(index.score)}`}>
        <p className="text-[10px] font-bold tracking-[0.28em]">SOVEREIGN 100 INDEX // {index.status}</p>
        <p className="mt-2 text-4xl font-black tracking-tighter sm:text-6xl">SCORE: {index.score} / 100</p>
        <p className="mt-3 text-xs tracking-wider">
          R {index.breakdown.robustness.toFixed(2)} / 30 · P {index.breakdown.privacy.toFixed(2)} / 25 · F {index.breakdown.fuzzing.toFixed(2)} / 45
        </p>
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
