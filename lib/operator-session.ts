import "server-only";
import { cookies } from "next/headers";
import { getBearerToken, verifyOperatorToken, type OperatorIdentity } from "@/lib/auth-token";

const SESSION_COOKIE = "mesh_session";

export class OperatorSessionError extends Error {
  constructor() {
    super("An authenticated operator session is required.");
    this.name = "OperatorSessionError";
  }
}

/**
 * Verifies operator credentials for API routes and Server Actions.
 *
 * 1. Checks `Authorization: Bearer <JWT>` if `request` is provided.
 * 2. Falls back to `mesh_session` HTTP-only cookie from request headers.
 * 3. Falls back to Next's `cookies()` only if no request cookie is available.
 * 4. Never trusts client-supplied `x-mesh-operator-*` headers as authentication.
 */
export async function requireOperatorSession(request?: Request): Promise<OperatorIdentity> {
  // 1. Try Bearer token from Request Authorization header
  if (request) {
    const authHeader = request.headers.get("authorization");
    const bearerToken = getBearerToken(authHeader);
    if (bearerToken) {
      const identity = await verifyOperatorToken(bearerToken);
      if (identity) {
        return identity;
      }
    }
  }

  // 2. Try cookie from request Cookie header
  let sessionToken: string | undefined;
  if (request) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const cookiesArr = cookieHeader.split(";").map(c => c.trim());
      for (const c of cookiesArr) {
        if (c.startsWith(`${SESSION_COOKIE}=`)) {
          sessionToken = c.substring(SESSION_COOKIE.length + 1);
          break;
        }
      }
    }
  }

  // 3. Fall back to Next.js cookies() API
  if (!sessionToken) {
    try {
      sessionToken = cookies().get(SESSION_COOKIE)?.value;
    } catch {
      // cookies() may throw outside Next.js request contexts
    }
  }

  if (sessionToken) {
    const identity = await verifyOperatorToken(sessionToken);
    if (identity) {
      return identity;
    }
  }

  // 4. Reject missing or invalid credentials
  throw new OperatorSessionError();
}
