import { describe, expect, it, beforeEach, afterEach, vi, MockInstance } from "vitest";

vi.mock("@/lib/operator-session", () => ({
  requireOperatorSession: vi.fn(),
  OperatorSessionError: class OperatorSessionError extends Error {}
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn()
}));

vi.mock("@/lib/driftMonitorUrl", () => ({
  resolveDriftMonitorUrl: vi.fn(),
  getDriftMonitorApiToken: vi.fn(),
  DriftMonitorUnavailableError: class DriftMonitorUnavailableError extends Error {}
}));

import { POST } from "./route";
import { requireOperatorSession, OperatorSessionError } from "@/lib/operator-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveDriftMonitorUrl, getDriftMonitorApiToken, DriftMonitorUnavailableError } from "@/lib/driftMonitorUrl";

describe("POST /api/generate-swarm-attack", () => {
  const originalEnv = process.env;
  let mockFetch: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CI: "true" };
    mockFetch = vi.spyOn(globalThis, "fetch").mockImplementation(vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    mockFetch.mockRestore();
  });

  function createRequest(body: any = { target_context: "test" }) {
    return new Request("http://localhost:3000/api/generate-swarm-attack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.168.1.1"
      },
      body: JSON.stringify(body)
    });
  }

  const VALID_IDENTITY = { subject: "op", scopes: ["mesh:operator"], roles: ["operator"] };

  it("returns 401 on missing or invalid operator credentials", async () => {
    vi.mocked(requireOperatorSession).mockRejectedValueOnce(new OperatorSessionError());

    const res = await POST(createRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "UNAUTHORIZED",
      message: "An authenticated operator session is required."
    });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limiter blocks request and backend fetch is not called", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSecs: 30 });

    const res = await POST(createRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({
      error: "RATE_LIMIT_EXCEEDED",
      message: "Swarm generation rate limit exceeded. Throttle your requests."
    });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(resolveDriftMonitorUrl).not.toHaveBeenCalled();
  });

  it("returns 503 when rate limiter throws in non-CI mode", async () => {
    process.env.CI = "false";
    process.env.GITHUB_ACTIONS = "false";
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockRejectedValueOnce(new Error("Redis offline"));

    const res = await POST(createRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "RATE_LIMIT_UNAVAILABLE",
      message: "Compute protection unavailable."
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 503 when drift-monitor URL is unconfigured", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSecs: 0 });
    vi.mocked(resolveDriftMonitorUrl).mockImplementationOnce(() => {
      throw new DriftMonitorUnavailableError("Unconfigured");
    });

    const res = await POST(createRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "DRIFT_MONITOR_UNAVAILABLE",
      message: "Drift monitor service is not configured."
    });
  });

  it("returns 503 when backend fetch throws an error (e.g., timeout/abort)", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSecs: 0 });
    vi.mocked(resolveDriftMonitorUrl).mockReturnValueOnce("http://drift");
    vi.mocked(getDriftMonitorApiToken).mockReturnValueOnce("secret-token");
    
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

    const res = await POST(createRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "DRIFT_MONITOR_UNAVAILABLE",
      message: "Drift monitor service is unreachable."
    });
  });

  it("returns 503 when drift monitor returns HTTP 503", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSecs: 0 });
    vi.mocked(resolveDriftMonitorUrl).mockReturnValueOnce("http://drift");
    vi.mocked(getDriftMonitorApiToken).mockReturnValueOnce("secret-token");
    
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }));

    const res = await POST(createRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "DRIFT_MONITOR_UNAVAILABLE",
      message: "Swarm generation service returned an error."
    });
  });

  it("returns 502 when drift monitor returns a non-503 error (e.g. 500)", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSecs: 0 });
    vi.mocked(resolveDriftMonitorUrl).mockReturnValueOnce("http://drift");
    vi.mocked(getDriftMonitorApiToken).mockReturnValueOnce("secret-token");
    
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Server Error" }), { status: 500 }));

    const res = await POST(createRequest());
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "DRIFT_MONITOR_ERROR",
      message: "Swarm generation service returned an error."
    });
  });

  it("returns 200 on success, forwards Authorization header, and calls mockFetch", async () => {
    vi.mocked(requireOperatorSession).mockResolvedValueOnce(VALID_IDENTITY);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: true, retryAfterSecs: 0 });
    vi.mocked(resolveDriftMonitorUrl).mockReturnValueOnce("http://drift");
    vi.mocked(getDriftMonitorApiToken).mockReturnValueOnce("secret-token");
    
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ generated: "attack payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    const res = await POST(createRequest());
    
    // Assert exact rate limit contract
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(checkRateLimit).toHaveBeenCalledWith("swarm:192.168.1.1", 20, 60);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ generated: "attack payload" });

    expect(mockFetch).toHaveBeenCalledWith("http://drift/api/generate-swarm-attack", expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret-token"
      }
    }));
  });
});

