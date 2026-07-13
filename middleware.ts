import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBearerToken, verifyOperatorToken } from "@/lib/auth-token";

const UNAUTHORIZED_RESPONSE = {
  error: "UNAUTHORIZED_EXECUTION",
  message: "Valid Bearer token required for Mesh APIs."
};

export async function middleware(request: NextRequest) {
  const token =
    getBearerToken(request.headers.get("authorization")) ?? request.cookies.get("mesh_session")?.value;
  const identity = token ? await verifyOperatorToken(token) : null;

  if (!identity) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, {
      status: 401,
      headers: { "x-request-id": crypto.randomUUID() }
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mesh-operator-subject", identity.subject);
  requestHeaders.set("x-mesh-operator-roles", identity.roles.join(","));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/api/proxy/:path*",
    "/api/sandbox",
    "/api/registry",
    "/api/compliance/:path*",
    "/api/reports/:path*",
    "/dashboard/:path*",
    "/playground/:path*"
  ]
};
