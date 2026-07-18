import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

const TEST_SECRET = "test-operator-secret-must-be-at-least-32-characters";

function createToken(overrides: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: "operator-1",
    iss: "https://identity.example.gov",
    aud: "guardrail-mesh-operator",
    exp: Math.floor(Date.now() / 1_000) + 300,
    scope: "mesh:operator",
    ...overrides
  });
  const signature = createHmac("sha256", TEST_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function createRequest(
  authorization?: string,
  path = "/api/proxy/v1/chat/completions",
  cookie?: string
) {
  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  if (cookie) {
    headers.set("cookie", cookie);
  }

  return new NextRequest(`http://localhost${path}`, {
    headers
  });
}

describe("Mesh API middleware", () => {
  process.env.MESH_AUTH_TOKEN_SECRET = TEST_SECRET;
  process.env.MESH_AUTH_ISSUER = "https://identity.example.gov";
  process.env.MESH_AUTH_AUDIENCE = "guardrail-mesh-operator";

  it("rejects missing authorization headers", async () => {
    const response = await middleware(createRequest());

    await expect(response.json()).resolves.toEqual({
      error: "UNAUTHORIZED"
    });
    expect(response.status).toBe(401);
  });

  it("rejects malformed bearer tokens", () => {
    return expect(middleware(createRequest("Basic token"))).resolves.toMatchObject({ status: 401 });
  });

  it("redirects unauthenticated UI requests to the login page", async () => {
    const response = await middleware(createRequest(undefined, "/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("keeps unauthenticated API requests as strict JSON errors", async () => {
    const response = await middleware(createRequest(undefined, "/api/sandbox"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "UNAUTHORIZED"
    });
  });

  it("accepts an HttpOnly operator session cookie for dashboard API fetches", async () => {
    const response = await middleware(
      createRequest(undefined, "/api/coverage/modality", `mesh_session=${createToken()}`)
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects an unsigned or expired operator token", async () => {
    const malformed = await middleware(createRequest("Bearer not.a.valid-token"));
    const expired = await middleware(
      createRequest(`Bearer ${createToken({ exp: Math.floor(Date.now() / 1_000) - 120 })}`)
    );

    expect(malformed.status).toBe(401);
    expect(expired.status).toBe(401);
  });

  it("allows a signed, scoped operator token", async () => {
    const response = await middleware(createRequest(`Bearer ${createToken()}`));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps public lookup outside the protected operator boundary", () => {
    expect(config.matcher).toEqual([
      "/api/proxy/:path*",
      "/api/sandbox/:path*",
      "/api/fuzzer/:path*",
      "/api/registry",
      "/api/compliance/:path*",
      "/api/coverage/:path*",
      "/api/mesh-payloads",
      "/api/reports/:path*",
      "/dashboard/:path*",
      "/playground/:path*"
    ]);
  });
});
