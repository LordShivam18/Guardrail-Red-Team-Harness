import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// Hoist mocks
vi.mock("@/lib/operator-session", () => ({
  requireOperatorSession: vi.fn(),
  OperatorSessionError: class OperatorSessionError extends Error {}
}));

vi.mock("@/agents/guardedAgent", () => ({
  guardedResponse: vi.fn()
}));

vi.mock("@/lib/sovereign/persistence", () => ({
  persistSovereignIndex: vi.fn()
}));

vi.mock("@/lib/driftMonitorUrl", () => ({
  resolveDriftMonitorUrl: vi.fn(),
  getDriftMonitorApiToken: vi.fn(),
  isCiTestMode: vi.fn(),
  DriftMonitorUnavailableError: class DriftMonitorUnavailableError extends Error {}
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { POST } from "./route";
import { requireOperatorSession, OperatorSessionError } from "@/lib/operator-session";
import { guardedResponse } from "@/agents/guardedAgent";
import { persistSovereignIndex } from "@/lib/sovereign/persistence";
import { isCiTestMode, resolveDriftMonitorUrl } from "@/lib/driftMonitorUrl";

describe("POST /api/sandbox/evaluate-agent", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CI: "true" };
    vi.mocked(isCiTestMode).mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
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

  it("produces HTTP 200 and expected schema on CONTAINED evaluation", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce({ subject: "op", roles: [] });
    // Mock the agent returning a safe final output
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
  });

  it("produces HTTP 200 and HIJACKED status when DLP is intercepted", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce({ subject: "op", roles: [] });
    // Provide output that triggers CI DLP pattern
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
    vi.mocked(requireOperatorSession).mockResolvedValueOnce({ subject: "op", roles: [] });
    // Force production mode for DLP
    vi.mocked(isCiTestMode).mockReturnValue(false);
    // Mock URL resolution throws unconfigured or fetch fails
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
