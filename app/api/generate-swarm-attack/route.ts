import { NextResponse } from "next/server";
import {
  resolveDriftMonitorUrl,
  getDriftMonitorApiToken,
  DriftMonitorUnavailableError
} from "@/lib/driftMonitorUrl";
import { requireOperatorSession, OperatorSessionError } from "@/lib/operator-session";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DRIFT_MONITOR_TIMEOUT_MS = 30_000;
const SWARM_RATE_LIMIT = 20;
const SWARM_RATE_WINDOW_SECS = 60;

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}

export async function POST(request: Request) {
  // 1. Require authenticated operator session
  try {
    await requireOperatorSession(request);
  } catch (error) {
    if (error instanceof OperatorSessionError) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "An authenticated operator session is required." },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Authentication failure." },
      { status: 401 }
    );
  }

  // 2. Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_REQUEST", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  // 3. Apply Redis-backed rate limiting
  const clientIp = getClientIp(request);
  try {
    const rateLimit = await checkRateLimit(
      `swarm:${clientIp}`,
      SWARM_RATE_LIMIT,
      SWARM_RATE_WINDOW_SECS
    );

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Swarm generation rate limit exceeded. Throttle your requests."
        },
        {
          status: 429,
          headers: { "retry-after": String(rateLimit.retryAfterSecs) }
        }
      );
    }
  } catch (error) {
    // If rate limiter fails in non-CI environment, fail safely
    const isTestMode = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
    if (!isTestMode) {
      console.error("[generate-swarm-attack] Rate limit check failed:", error);
      return NextResponse.json(
        {
          error: "RATE_LIMIT_UNAVAILABLE",
          message: "Compute protection unavailable."
        },
        { status: 503 }
      );
    }
  }

  // 4. Resolve drift-monitor URL (returns 503 if unconfigured)
  let driftUrl: string;
  try {
    driftUrl = resolveDriftMonitorUrl();
  } catch (error) {
    if (error instanceof DriftMonitorUnavailableError) {
      return NextResponse.json(
        {
          error: "DRIFT_MONITOR_UNAVAILABLE",
          message: "Drift monitor service is not configured."
        },
        { status: 503 }
      );
    }
    throw error;
  }

  // 5. Build headers with service-to-service auth token
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const serviceToken = getDriftMonitorApiToken();
  if (serviceToken) {
    headers["Authorization"] = `Bearer ${serviceToken}`;
  }

  // 6. Forward request to drift monitor
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DRIFT_MONITOR_TIMEOUT_MS);

    try {
      const res = await fetch(`${driftUrl}/api/generate-swarm-attack`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const status = res.status === 503 ? 503 : 502;
        return NextResponse.json(
          {
            error: status === 503 ? "DRIFT_MONITOR_UNAVAILABLE" : "DRIFT_MONITOR_ERROR",
            message: "Swarm generation service returned an error."
          },
          { status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("[generate-swarm-attack] Drift monitor request failed:", error instanceof Error ? error.message : String(error));

    return NextResponse.json(
      {
        error: "DRIFT_MONITOR_UNAVAILABLE",
        message: "Drift monitor service is unreachable."
      },
      { status: 503 }
    );
  }
}
