import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UNAUTHORIZED_RESPONSE = {
  error: "UNAUTHORIZED_EXECUTION",
  message: "Valid Bearer token required for Mesh APIs."
};

const BEARER_TOKEN_PATTERN = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/;

export function middleware(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";

  if (!BEARER_TOKEN_PATTERN.test(authorization)) {
    return NextResponse.json(UNAUTHORIZED_RESPONSE, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/proxy/:path*",
    "/api/sandbox/:path*",
    "/api/registry/:path*",
    "/api/compliance/:path*"
  ]
};
