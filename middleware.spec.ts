import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

function createRequest(authorization?: string) {
  const headers = new Headers();

  if (authorization) {
    headers.set("authorization", authorization);
  }

  return new NextRequest("http://localhost/api/proxy/v1/chat/completions", {
    headers
  });
}

describe("Mesh API middleware", () => {
  it("rejects missing authorization headers", async () => {
    const response = middleware(createRequest());

    await expect(response.json()).resolves.toEqual({
      error: "UNAUTHORIZED_EXECUTION",
      message: "Valid Bearer token required for Mesh APIs."
    });
    expect(response.status).toBe(401);
  });

  it("rejects malformed bearer tokens", () => {
    const response = middleware(createRequest("Basic token"));

    expect(response.status).toBe(401);
  });

  it("allows syntactically valid bearer tokens", () => {
    const response = middleware(createRequest("Bearer mesh_test_token.123"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("matches execution and compliance Mesh APIs", () => {
    expect(config.matcher).toEqual([
      "/api/proxy/:path*",
      "/api/sandbox/:path*",
      "/api/registry/:path*",
      "/api/compliance/:path*"
    ]);
  });
});
