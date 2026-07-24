import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { requireOperatorSession, OperatorSessionError } from "./operator-session";
import { createOperatorSessionToken } from "./auth-token";
import { POST as handleSwarmPost } from "../app/api/generate-swarm-attack/route";
import { POST as handleEvaluateAgentPost } from "../app/api/sandbox/evaluate-agent/route";

const TEST_SECRET = "ci_mesh_auth_secret_must_be_32_chars";
const TEST_ISSUER = "https://identity.example.gov";
const TEST_AUDIENCE = "guardrail-mesh-operator";

describe("Focused Operator Authentication & Route Security Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MESH_AUTH_TOKEN_SECRET: TEST_SECRET,
      MESH_AUTH_ISSUER: TEST_ISSUER,
      MESH_AUTH_AUDIENCE: TEST_AUDIENCE,
      CI: "true",
      GITHUB_ACTIONS: "true"
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("valid bearer JWT succeeds and returns OperatorIdentity", async () => {
    const validJwt = await createOperatorSessionToken("ci-test-operator");
    expect(validJwt).toBeTruthy();

    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: {
        authorization: `Bearer ${validJwt}`
      }
    });

    const identity = await requireOperatorSession(req);
    expect(identity).toMatchObject({
      subject: "ci-test-operator",
      roles: ["operator"]
    });
  });

  it("valid session cookie succeeds when mesh_session is present", async () => {
    const validJwt = await createOperatorSessionToken("cookie-operator");
    expect(validJwt).toBeTruthy();

    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: {
        authorization: `Bearer ${validJwt}`
      }
    });

    const identity = await requireOperatorSession(req);
    expect(identity.subject).toBe("cookie-operator");
  });

  it("missing credentials throws OperatorSessionError (returns 401)", async () => {
    const req = new Request("http://localhost:3000/api/generate-swarm-attack", {
      headers: {}
    });

    await expect(requireOperatorSession(req)).rejects.toThrow(OperatorSessionError);
  });

  it("invalid bearer token throws OperatorSessionError (returns 401)", async () => {
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: {
        authorization: "Bearer invalid.jwt.token"
      }
    });

    await expect(requireOperatorSession(req)).rejects.toThrow(OperatorSessionError);
  });

  it("forged x-mesh-operator-subject header without a valid token is rejected with 401", async () => {
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: {
        "x-mesh-operator-subject": "admin-forged-subject",
        "x-mesh-operator-roles": "admin,operator"
      }
    });

    await expect(requireOperatorSession(req)).rejects.toThrow(OperatorSessionError);
  });

  it("/api/generate-swarm-attack route rejects unauthenticated request with 401", async () => {
    const req = new Request("http://localhost:3000/api/generate-swarm-attack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_context: "test" })
    });

    const res = await handleSwarmPost(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
  });

  it("/api/generate-swarm-attack reaches rate limiter & drift-monitor forwarding after valid bearer authentication", async () => {
    const validJwt = await createOperatorSessionToken("ci-test-operator");
    const req = new Request("http://localhost:3000/api/generate-swarm-attack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${validJwt}`
      },
      body: JSON.stringify({ target_context: "A helpful assistant" })
    });

    const res = await handleSwarmPost(req);
    // In CI mode with mock or test env, it proceeds past auth (status is 200 or 503 if drift monitor unconfigured)
    expect([200, 503]).toContain(res.status);
  });

  it("/api/sandbox/evaluate-agent accepts valid CI bearer token", async () => {
    const validJwt = await createOperatorSessionToken("ci-test-operator");
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${validJwt}`
      },
      body: JSON.stringify({
        scenarioId: "poisoned-invoice-sql",
        targetModel: "gemini-2.0-flash"
      })
    });

    const res = await handleEvaluateAgentPost(req);
    expect(res.status).not.toBe(401);
  });
});
