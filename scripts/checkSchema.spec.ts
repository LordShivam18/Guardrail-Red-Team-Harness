import { describe, expect, it } from "vitest";

import {
  buildMissingColumnItems,
  buildMissingTableItems,
  formatSchemaGap,
} from "./checkSchema";

describe("formatSchemaGap", () => {
  it("produces WHAT / EXPECTED / REMEDIATION blocks", () => {
    const text = formatSchemaGap({
      what: "redteam_results.modality is missing",
      expected: "supabase/migrations/004_phase9_modality.sql",
      remediation: "npm run db:migrate:004",
    });

    expect(text).toContain("ERROR:");
    expect(text).toContain("redteam_results.modality is missing");
    expect(text).toContain("EXPECTED:");
    expect(text).toContain("004_phase9_modality.sql");
    expect(text).toContain("REMEDIATION:");
    expect(text).toContain("npm run db:migrate:004");
  });
});

describe("buildMissingColumnItems", () => {
  it("flags the modality gap with the 004 migration", () => {
    const items = buildMissingColumnItems(new Set(["redteam_runs.jailbreak_rate"]));
    const modalities = items.filter((item) => item.what.includes(".modality"));

    expect(modalities).toHaveLength(2);
    expect(modalities.every((item) => item.expected.includes("004_phase9_modality.sql"))).toBe(
      true,
    );
    expect(modalities.every((item) => item.remediation === "npm run db:migrate:004")).toBe(true);
  });

  it("returns no items when all lifecycle columns exist", () => {
    const existing = new Set([
      "redteam_results.modality",
      "adversarial_prompts.modality",
      "redteam_runs.sovereign_score",
      "redteam_runs.compliance_status",
      "redteam_runs.robustness_subscore",
      "redteam_runs.privacy_subscore",
      "redteam_runs.fuzzing_subscore",
      "redteam_runs.evolutionary_lineage",
      "redteam_runs.model_status",
      "redteam_runs.onchain_tx_hash",
      "redteam_runs.onchain_network",
    ]);

    expect(buildMissingColumnItems(existing)).toHaveLength(0);
  });

  it("maps sovereign columns to 005 and model_status to 007", () => {
    const items = buildMissingColumnItems(new Set());
    const byWhat = new Map(items.map((item) => [item.what, item]));

    expect(byWhat.get("redteam_runs.sovereign_score is missing")?.remediation).toBe(
      "npm run db:migrate:005",
    );
    expect(byWhat.get("redteam_runs.model_status is missing")?.remediation).toBe(
      "npm run db:migrate:007",
    );
    expect(byWhat.get("redteam_runs.onchain_tx_hash is missing")?.remediation).toBe(
      "npm run db:migrate:003a",
    );
  });
});

describe("buildMissingTableItems", () => {
  it("flags compliance and agentic tables with actionable remediation", () => {
    const items = buildMissingTableItems(
      new Set(["adversarial_prompts", "redteam_runs", "redteam_results"]),
    );
    const byWhat = new Map(items.map((item) => [item.what, item]));

    expect(byWhat.get("table compliance_frameworks is missing")?.remediation).toBe(
      "npm run db:migrate:003a",
    );
    expect(byWhat.get("table agentic_tool_sequences is missing")?.remediation).toBe(
      "npm run db:migrate:004",
    );
  });

  it("returns no items when all tables exist", () => {
    const existing = new Set([
      "adversarial_prompts",
      "redteam_runs",
      "redteam_results",
      "compliance_frameworks",
      "compliance_mappings",
      "compliance_evidence",
      "agentic_tool_sequences",
    ]);

    expect(buildMissingTableItems(existing)).toHaveLength(0);
  });
});
