import { describe, expect, it, beforeEach, afterEach, vi, MockInstance } from "vitest";

// Hoist mocks
vi.mock("@/lib/operator-session", () => ({
  requireOperatorSession: vi.fn(),
  OperatorSessionError: class OperatorSessionError extends Error {}
}));

vi.mock("@/agents/guardedAgent", () => ({
  guardedResponse: vi.fn()
}));

// Mock sovereign index persistence
vi.mock("@/lib/sovereign/persistence", () => ({
  persistSovereignIndex: vi.fn(),
  SovereignRunNotFoundError: class SovereignRunNotFoundError extends Error {
    constructor() {
      super("Cannot persist Sovereign Index: red-team run was not found.");
      this.name = "SovereignRunNotFoundError";
    }
  }
}));

vi.mock("@/lib/driftMonitorUrl", () => ({
  resolveDriftMonitorUrl: vi.fn(),
  getDriftMonitorApiToken: vi.fn(),
  isCiTestMode: vi.fn(),
  DriftMonitorUnavailableError: class DriftMonitorUnavailableError extends Error {}
}));

import { POST } from "./route";
import { requireOperatorSession, OperatorSessionError } from "@/lib/operator-session";
import { guardedResponse } from "@/agents/guardedAgent";
import { isCiTestMode, resolveDriftMonitorUrl } from "@/lib/driftMonitorUrl";
import { persistSovereignIndex, SovereignRunNotFoundError } from "@/lib/sovereign/persistence";

describe("POST /api/sandbox/evaluate-agent", () => {
  const originalEnv = process.env;
  let mockFetch: MockInstance;
  const VALID_IDENTITY = { subject: "op", scopes: ["mesh:operator"], roles: ["operator"] };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CI: "true" };
    vi.mocked(isCiTestMode).mockReturnValue(true);
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    mockFetch.mockRestore();
  });

  function createRequest(body: any = { scenarioId: "poisoned-invoice-sql" }) {
    return new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  it("returns 401 on missing or invalid credentials", async () => {
    vi.mocked(requireOperatorSession).mockRejectedValueOnce(new OperatorSessionError());
    const res = await POST(createRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "An authenticated operator session is required." });
  });

  it("produces HTTP 200 and expected schema on CONTAINED evaluation without persist", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(guardedResponse).mockResolvedValueOnce({
      finalOutput: '{"final": "I cannot fulfill this request."}',
      blocked: false
    });

    const res = await POST(createRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toMatchObject({
      status: "CONTAINED",
      scenario: {
        id: "poisoned-invoice-sql",
        title: expect.any(String),
        objective: expect.any(String)
      },
      detection: expect.any(Object),
      trace: expect.any(Array),
      decisions: expect.any(Array),
      dlpIntercepted: false,
      sovereignImpact: {
        agentHijacking: { totalScenarios: 1, hijackedScenarios: 0 },
        persistedIndex: null
      }
    });
    expect(persistSovereignIndex).not.toHaveBeenCalled();
  });

  it("returns persisted index when evaluation is run with a valid existing run persistence request", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(guardedResponse).mockResolvedValueOnce({
      finalOutput: '{"final": "I cannot fulfill this request."}',
      blocked: false
    });

    const mockPersistedIndex = {
      score: 92,
      status: "COMPLIANT",
      breakdown: { robustness: 95, privacy: 100, fuzzing: 80 }
    };
    vi.mocked(persistSovereignIndex).mockResolvedValueOnce(mockPersistedIndex as any);

    const validRunId = "12345678-1234-4234-8234-123456789abc";
    const req = createRequest({
      scenarioId: "poisoned-invoice-sql",
      persist: {
        runId: validRunId,
        robustness: {
          decision: "CERTIFIED",
          pA: 0.95,
          pB: 0.05,
          epsilonRadius: 0.5,
          rawMetrics: {},
          scope: { tokenizerDigest: "abc", representation: "embedding-l2", sampleCount: 100, alpha: 0.01 }
        },
        privacy: { status: "COMPLIANT", epsilon: 1.0, delta: 1e-5 },
        fuzzerStats: { jailbreakRate: 0 }
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.sovereignImpact.persistedIndex).toEqual(mockPersistedIndex);
    expect(persistSovereignIndex).toHaveBeenCalledWith(
      validRunId,
      expect.objectContaining({
        fuzzerStats: expect.objectContaining({
          agentHijacking: { totalScenarios: 1, hijackedScenarios: 0 }
        })
      })
    );
  });

  it("classifies SovereignRunNotFoundError with structured logging and generic HTTP 500 response", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(guardedResponse).mockResolvedValueOnce({
      finalOutput: '{"final": "I cannot fulfill this request."}',
      blocked: false
    });
    vi.mocked(persistSovereignIndex).mockRejectedValueOnce(
      new SovereignRunNotFoundError()
    );

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const validRunId = "12345678-1234-4234-8234-123456789abc";
    const req = createRequest({
      scenarioId: "poisoned-invoice-sql",
      persist: {
        runId: validRunId,
        robustness: {
          decision: "CERTIFIED",
          pA: 0.95,
          pB: 0.05,
          epsilonRadius: 0.5,
          rawMetrics: {},
          scope: { tokenizerDigest: "abc", representation: "embedding-l2", sampleCount: 100, alpha: 0.01 }
        },
        privacy: { status: "COMPLIANT", epsilon: 1.0, delta: 1e-5 },
        fuzzerStats: { jailbreakRate: 0 }
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Agent sandbox evaluation failed." });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[agent-sandbox] Sovereign Index persistence failed: run not found");
    expect(consoleErrorSpy).not.toHaveBeenCalledWith("[agent-sandbox] Evaluation failed.");
  });

  it("handles unrelated database/internal errors without misclassifying or exposing raw details", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(guardedResponse).mockResolvedValueOnce({
      finalOutput: '{"final": "I cannot fulfill this request."}',
      blocked: false
    });
    const dbErr = new Error("connection to server at postgres:5432 failed: FATAL: password authentication failed");
    vi.mocked(persistSovereignIndex).mockRejectedValueOnce(dbErr);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const validRunId = "12345678-1234-4234-8234-123456789abc";
    const req = createRequest({
      scenarioId: "poisoned-invoice-sql",
      persist: {
        runId: validRunId,
        robustness: {
          decision: "CERTIFIED",
          pA: 0.95,
          pB: 0.05,
          epsilonRadius: 0.5,
          rawMetrics: {},
          scope: { tokenizerDigest: "abc", representation: "embedding-l2", sampleCount: 100, alpha: 0.01 }
        },
        privacy: { status: "COMPLIANT", epsilon: 1.0, delta: 1e-5 },
        fuzzerStats: { jailbreakRate: 0 }
      }
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Agent sandbox evaluation failed." });
    expect(body.error).not.toContain("postgres");
    expect(body.error).not.toContain("FATAL");
    expect(consoleErrorSpy).toHaveBeenCalledWith("[agent-sandbox] Evaluation failed.");
    expect(consoleErrorSpy).not.toHaveBeenCalledWith("[agent-sandbox] Sovereign Index persistence failed: run not found");
  });

  it("produces HTTP 200 and HIJACKED status when DLP is intercepted", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(guardedResponse).mockResolvedValueOnce({
      finalOutput: '{"final": "Here is the data: Project Apex"}',
      blocked: false
    });

    const res = await POST(createRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.status).toBe("HIJACKED");
    expect(json.dlpIntercepted).toBe(true);
    expect(json.detection.hijacked).toBe(true);
    expect(json.detection.reason).toMatch(/CRITICAL: RAG Exfiltration Attempt Blocked/);
  });

  it("returns exactly 503 when DLP is unavailable in production", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(isCiTestMode).mockReturnValue(false);
    vi.mocked(resolveDriftMonitorUrl).mockImplementationOnce(() => {
      throw new Error("unconfigured");
    });
    
    vi.mocked(guardedResponse).mockResolvedValueOnce({
      finalOutput: '{"final": "Some output"}',
      blocked: false
    });

    const res = await POST(createRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("DLP protection service is unavailable. Evaluation cannot proceed safely.");
  });
});
