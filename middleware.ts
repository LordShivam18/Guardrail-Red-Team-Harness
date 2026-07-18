import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBearerToken, verifyOperatorToken } from "@/lib/auth-token";

const UNAUTHORIZED_RESPONSE = {
  error: "UNAUTHORIZED"
};

export async function middleware(request: NextRequest) {
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  const sessionToken = request.cookies.get("mesh_session")?.value;
  // Verify each credential independently. An invalid external Authorization
  // header must not prevent an authenticated dashboard cookie from working.
  const bearerIdentity = bearerToken ? await verifyOperatorToken(bearerToken) : null;
  const identity = bearerIdentity ?? (sessionToken ? await verifyOperatorToken(sessionToken) : null);

  if (!identity) {
    if (!request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

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
    "/api/sandbox/:path*",
    "/api/fuzzer/:path*",
    "/api/registry",
    "/api/compliance/:path*",
    "/api/coverage/:path*",
    "/api/mesh-payloads",
    "/api/reports/:path*",
    "/dashboard/:path*",
    "/playground/:path*"
  ]
};
