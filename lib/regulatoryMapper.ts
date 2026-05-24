export type RegulatoryAuditReport = {
  euAiActClause: string;
  nistRmfPillar: string;
  isoControl: string;
};

export type RegulatoryTaxonomyTags = {
  owaspTag: string;
  mitreTag: string;
};

const JAILBREAK_MAPPING: RegulatoryAuditReport = {
  euAiActClause: "EU AI Act Article 15: Robustness, Accuracy, and Cybersecurity",
  nistRmfPillar: "NIST AI RMF Protect Pillar",
  isoControl: "ISO/IEC 42001 Control A.9: AI System Impact and Security"
};

const SENSITIVE_DISCLOSURE_MAPPING: RegulatoryAuditReport = {
  euAiActClause: "EU AI Act Article 10: Data Governance and Risk Mitigation",
  nistRmfPillar: "GDPR Privacy Compliance Framework and NIST AI RMF Govern Pillar",
  isoControl: "ISO/IEC 42001 Control A.8: Data and Logging"
};

const UNMAPPED_MAPPING: RegulatoryAuditReport = {
  euAiActClause: "Manual regulatory review required for unmapped AI safety taxonomy",
  nistRmfPillar: "Manual NIST AI RMF control selection required",
  isoControl: "Manual ISO/IEC 42001 control selection required"
};

export function generateRegulatoryAuditReport(
  owaspTag: string,
  mitreTag: string
): RegulatoryAuditReport {
  const normalizedOwaspTag = normalizeTaxonomyTag(owaspTag);
  const normalizedMitreTag = normalizeTaxonomyTag(mitreTag);

  if (normalizedOwaspTag.includes("OWASP LLM06")) {
    return SENSITIVE_DISCLOSURE_MAPPING;
  }

  if (
    normalizedOwaspTag.includes("OWASP LLM01") ||
    normalizedMitreTag.includes("MITRE AML.T0054")
  ) {
    return JAILBREAK_MAPPING;
  }

  return UNMAPPED_MAPPING;
}

export function inferRegulatoryTagsFromCategory(category: string): RegulatoryTaxonomyTags {
  const normalized = category.trim().toLowerCase();

  if (normalized === "pii") {
    return {
      owaspTag: "OWASP LLM06",
      mitreTag: ""
    };
  }

  if (
    normalized === "jailbreak" ||
    normalized === "bypass" ||
    normalized === "explicit" ||
    normalized === "toxic" ||
    normalized === "refusal" ||
    normalized === "toxic/refusal"
  ) {
    return {
      owaspTag: "OWASP LLM01",
      mitreTag: "MITRE AML.T0054"
    };
  }

  return {
    owaspTag: "",
    mitreTag: ""
  };
}

function normalizeTaxonomyTag(tag: string) {
  return tag.replace(/\s+/g, " ").trim().toUpperCase();
}
