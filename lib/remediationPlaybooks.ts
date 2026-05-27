/**
 * Remediation Playbooks
 *
 * Maps OWASP / MITRE ATLAS taxonomy labels to concrete mitigation
 * steps, regulatory badges, and example defensive code snippets.
 */

export type RemediationPlaybook = {
  /** Taxonomy label this playbook addresses. */
  taxonomyLabel: string;
  /** Short identifier for the playbook. */
  playbookId: string;
  /** Regulatory frameworks that mandate remediation for this class. */
  regulatoryBadges: string[];
  /** High-level mitigation summary (1–2 sentences). */
  summary: string;
  /** Ordered list of concrete remediation steps. */
  steps: string[];
  /** Optional inline code snippet demonstrating the primary defense. */
  codeSnippet?: {
    language: string;
    label: string;
    code: string;
  };
};

const playbooks: Record<string, RemediationPlaybook> = {
  "OWASP LLM01: Prompt Injection": {
    taxonomyLabel: "OWASP LLM01: Prompt Injection",
    playbookId: "PB-LLM01",
    regulatoryBadges: [
      "EU AI ACT: HIGH RISK",
      "NIST AI RMF: MAP 1.5",
      "ISO/IEC 42001"
    ],
    summary:
      "Prompt injection attacks manipulate LLM behavior by embedding adversarial instructions in user input. Defense requires input sanitization, system prompt isolation, and multi-layer judge evaluation.",
    steps: [
      "Deploy a pre-processing filter that strips known injection patterns (e.g., 'ignore previous instructions', 'you are now DAN') before the message reaches the LLM context window.",
      "Isolate the system prompt from user-controlled content using delimiter tokens and instruction hierarchy enforcement.",
      "Implement a secondary judge model (e.g., LlamaGuard or Gemini Safety) that evaluates the user message independently before forwarding to the primary model.",
      "Log all flagged attempts with full prompt text and classification metadata for SOC review.",
      "Conduct quarterly adversarial red-team sweeps against the injection filter using updated attack taxonomies (OWASP Top 10 for LLMs)."
    ],
    codeSnippet: {
      language: "typescript",
      label: "Pre-processing injection filter",
      code: `const INJECTION_PATTERNS = [
  /ignore\\s+(all\\s+)?previous\\s+instructions/i,
  /you\\s+are\\s+(now\\s+)?DAN/i,
  /developer\\s+mode/i,
  /bypass\\s+(all\\s+)?(content\\s+)?filters/i,
  /system\\s+prompt/i
];

function containsInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(input));
}`
    }
  },

  "OWASP LLM06: Sensitive Information Disclosure": {
    taxonomyLabel: "OWASP LLM06: Sensitive Information Disclosure",
    playbookId: "PB-LLM06",
    regulatoryBadges: [
      "EU AI ACT: HIGH RISK",
      "NIST AI RMF: GOVERN 1.2",
      "SOC-2 TYPE II",
      "GDPR ART. 32"
    ],
    summary:
      "PII leakage occurs when the model outputs sensitive data (SSN, credit cards, emails) from its training corpus or user context. Remediation requires output scrubbing, data minimization, and access controls.",
    steps: [
      "Implement regex-based PII scrubbing on all LLM outputs before delivery to the end user. Target patterns: SSN (XXX-XX-XXXX), credit card (Luhn-valid 13–19 digit sequences), emails, and phone numbers.",
      "Apply data minimization by stripping PII from training data and fine-tuning corpora during the data preparation phase.",
      "Deploy a post-processing redaction layer that replaces detected PII tokens with [REDACTED] placeholders.",
      "Enforce role-based access controls (RBAC) to restrict which user tiers can access models trained on sensitive datasets.",
      "Maintain an auditable PII incident log with timestamps, detected patterns, and remediation actions taken."
    ],
    codeSnippet: {
      language: "typescript",
      label: "Regex PII scrubber",
      code: `const PII_PATTERNS: [RegExp, string][] = [
  [/\\b\\d{3}-\\d{2}-\\d{4}\\b/g, "[SSN REDACTED]"],
  [/\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{1,4}\\b/g, "[CC REDACTED]"],
  [/\\b[\\w.-]+@[\\w.-]+\\.\\w{2,}\\b/g, "[EMAIL REDACTED]"],
  [/\\b\\+?1?[\\s.-]?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b/g, "[PHONE REDACTED]"]
];

function scrubPII(output: string): string {
  return PII_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    output
  );
}`
    }
  },

  "MITRE AML.T0054: LLM Jailbreak": {
    taxonomyLabel: "MITRE AML.T0054: LLM Jailbreak",
    playbookId: "PB-AML-T0054",
    regulatoryBadges: [
      "EU AI ACT: UNACCEPTABLE RISK",
      "NIST AI RMF: MEASURE 2.7",
      "MITRE ATLAS TACTIC TA0043"
    ],
    summary:
      "Jailbreak attacks exploit model alignment weaknesses to bypass safety guardrails. Defenses include multi-model consensus, behavioral boundary enforcement, and adversarial training.",
    steps: [
      "Deploy a multi-model judge consensus layer: if any model in the judge panel flags the input, block it (fail-closed architecture).",
      "Implement behavioral boundary enforcement by adding explicit refusal instructions at multiple positions in the system prompt (beginning, middle, end).",
      "Continuously fine-tune safety alignment using adversarial datasets generated from red-team sweeps.",
      "Rate-limit rapid successive requests from single users to prevent brute-force jailbreak iteration.",
      "Integrate canary token detection to identify prompts attempting to extract the system prompt or model internals.",
      "Deploy compute exhaustion monitoring (ΔC threshold) to detect resource-abuse jailbreak variants."
    ],
    codeSnippet: {
      language: "typescript",
      label: "Multi-model consensus judge",
      code: `async function consensusJudge(
  input: string,
  judges: JudgeProvider[]
): Promise<boolean> {
  const verdicts = await Promise.allSettled(
    judges.map((judge) => judge.evaluate(input))
  );

  // Fail-closed: block if ANY judge flags it
  return verdicts.every(
    (v) => v.status === "fulfilled" && v.value.isSafe
  );
}`
    }
  },

  "Baseline: Authorized Request": {
    taxonomyLabel: "Baseline: Authorized Request",
    playbookId: "PB-BASELINE",
    regulatoryBadges: ["NIST AI RMF: GOVERN 1.1", "ISO/IEC 42001"],
    summary:
      "This request was classified as safe and authorized. No remediation is required, but continuous monitoring ensures drift detection.",
    steps: [
      "No active remediation required — this interaction passed all safety evaluations.",
      "Continue monitoring for false-negative drift by re-evaluating a random sample of passed requests weekly.",
      "Maintain baseline interaction logs for audit trail compliance."
    ]
  },

  "Unmapped: Manual Review": {
    taxonomyLabel: "Unmapped: Manual Review",
    playbookId: "PB-UNMAPPED",
    regulatoryBadges: ["EU AI ACT: TRANSPARENCY", "NIST AI RMF: MAP 1.1"],
    summary:
      "This request could not be mapped to a known attack taxonomy. Manual review by the security operations team is required to classify and triage.",
    steps: [
      "Escalate to the SOC team for manual classification within 24 hours.",
      "If a new attack pattern is identified, create a new taxonomy entry and update the judge model's evaluation criteria.",
      "Add the prompt and classification to the adversarial training dataset for the next fine-tuning cycle.",
      "Document findings in the incident response log with full provenance metadata."
    ]
  }
};

/**
 * Look up the remediation playbook for a given taxonomy label.
 * Returns null if no playbook exists for the classification.
 */
export function getRemediationPlaybook(
  taxonomyLabel: string
): RemediationPlaybook | null {
  return playbooks[taxonomyLabel] ?? null;
}

/**
 * Returns all available playbook entries.
 */
export function getAllPlaybooks(): RemediationPlaybook[] {
  return Object.values(playbooks);
}
