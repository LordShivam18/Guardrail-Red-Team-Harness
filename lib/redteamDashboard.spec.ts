import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { sql } from "@/lib/db";
import {
  getLatestRunIncidents,
  isMissingColumnError,
  isMissingModalityColumnError,
} from "./redteamDashboard";

const MOCK_RUN = {
  id: "00000000-0000-0000-0000-000000000001",
  timestamp: new Date().toISOString(),
  model_version: "test-model",
  model_status: "VERIFIED",
  jailbreak_rate: 0,
  fp_rate: 0,
};

describe("isMissingColumnError", () => {
  it("detects Postgres missing-column errors", () => {
    expect(isMissingColumnError(new Error("column r.modality does not exist"))).toBe(true);
    expect(isMissingColumnError(new Error('column "safety_sharpe" does not exist'))).toBe(true);
    expect(isMissingColumnError(new Error("connection refused"))).toBe(false);
    expect(isMissingColumnError("column foo does not exist")).toBe(true);
  });
});

describe("isMissingModalityColumnError", () => {
  it("matches modality columns but not unrelated columns", () => {
    expect(isMissingModalityColumnError(new Error("column r.modality does not exist"))).toBe(
      true,
    );
    expect(isMissingModalityColumnError(new Error("column p.modality does not exist"))).toBe(
      true,
    );
    expect(isMissingModalityColumnError(new Error("column safety_sharpe does not exist"))).toBe(
      false,
    );
    expect(isMissingModalityColumnError(new Error("connection refused"))).toBe(false);
  });
});

describe("getLatestRunIncidents modality handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSqlForIncidentFlow(options: { primaryThrowsModalityError: boolean }) {
    vi.mocked(sql).mockImplementation(((strings: TemplateStringsArray) => {
      const text = strings.join(" ");

      if (text.includes("from redteam_runs")) {
        return Promise.resolve([MOCK_RUN]);
      }

      if (text.includes("r.modality")) {
        if (options.primaryThrowsModalityError) {
          return Promise.reject(new Error("column r.modality does not exist"));
        }

        return Promise.resolve([
          {
            id: "row-1",
            final_output: "final",
            raw_output: "raw",
            blocked: true,
            outcome_flag: "PASSED",
            created_at: new Date().toISOString(),
            modality: "vision",
            category: "jailbreak",
            prompt_text: "prompt",
          },
        ]);
      }

      if (text.includes("'text' as modality")) {
        return Promise.resolve([
          {
            id: "row-1",
            final_output: "final",
            raw_output: "raw",
            blocked: true,
            outcome_flag: "PASSED",
            created_at: new Date().toISOString(),
            modality: "text",
            category: "jailbreak",
            prompt_text: "prompt",
          },
        ]);
      }

      return Promise.reject(new Error(`unexpected query: ${text.slice(0, 80)}`));
    }) as unknown as typeof sql);
  }

  it("uses the modality-aware query when columns exist", async () => {
    mockSqlForIncidentFlow({ primaryThrowsModalityError: false });

    const data = await getLatestRunIncidents();

    expect(data?.incidents[0]?.modality).toBe("vision");
  });

  it("falls back to 'text' modality when the column is missing instead of crashing", async () => {
    mockSqlForIncidentFlow({ primaryThrowsModalityError: true });

    const data = await getLatestRunIncidents();

    expect(data?.runId).toBe(MOCK_RUN.id);
    expect(data?.incidents[0]?.modality).toBe("text");
  });

  it("rethrows non-modality column errors", async () => {
    vi.mocked(sql).mockImplementation(((strings: TemplateStringsArray) => {
      const text = strings.join(" ");

      if (text.includes("from redteam_runs")) {
        return Promise.resolve([MOCK_RUN]);
      }

      return Promise.reject(new Error('column "safety_sharpe" does not exist'));
    }) as unknown as typeof sql);

    await expect(getLatestRunIncidents()).rejects.toThrow("safety_sharpe");
  });
});
