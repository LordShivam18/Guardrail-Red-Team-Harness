import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { requireOperatorSession, OperatorSessionError } from "./operator-session";
import { createOperatorSessionToken } from "./auth-token";

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
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: { authorization: `Bearer ${validJwt}` }
    });
    const identity = await requireOperatorSession(req);
    expect(identity).toMatchObject({ subject: "ci-test-operator", roles: ["operator"] });
  });

  it("valid session cookie succeeds when mesh_session is present in Cookie header", async () => {
    const validJwt = await createOperatorSessionToken("cookie-operator");
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: { Cookie: `other_cookie=123; mesh_session=${validJwt}; session=abc` }
    });
    const identity = await requireOperatorSession(req);
    expect(identity.subject).toBe("cookie-operator");
  });

  it("valid bearer takes precedence over a different valid cookie identity", async () => {
    const bearerJwt = await createOperatorSessionToken("bearer-operator");
    const cookieJwt = await createOperatorSessionToken("cookie-operator");
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: {
        authorization: `Bearer ${bearerJwt}`,
        Cookie: `mesh_session=${cookieJwt}`
      }
    });
    const identity = await requireOperatorSession(req);
    expect(identity.subject).toBe("bearer-operator");
  });

  it("invalid bearer plus valid cookie uses the cookie", async () => {
    const cookieJwt = await createOperatorSessionToken("cookie-operator");
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: {
        authorization: `Bearer invalid.jwt.token`,
        Cookie: `mesh_session=${cookieJwt}`
      }
    });
    const identity = await requireOperatorSession(req);
    expect(identity.subject).toBe("cookie-operator");
  });

  it("invalid bearer without a valid cookie returns 401 (throws error)", async () => {
    const req = new Request("http://localhost:3000/api/sandbox/evaluate-agent", {
      headers: { authorization: "Bearer invalid.jwt.token" }
    });
    await expect(requireOperatorSession(req)).rejects.toThrow(OperatorSessionError);
  });

  it("missing credentials throws OperatorSessionError (returns 401)", async () => {
    const req = new Request("http://localhost:3000/api/generate-swarm-attack", { headers: {} });
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
});
