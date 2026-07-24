import { NextResponse } from "next/server";
import {
  resolveDriftMonitorUrl,
  getDriftMonitorApiToken,
  DriftMonitorUnavailableError
} from "@/lib/driftMonitorUrl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DRIFT_MONITOR_TIMEOUT_MS = 30_000;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  // Resolve drift-monitor URL (returns 503 if unconfigured)
  let driftUrl: string;
  try {
    driftUrl = resolveDriftMonitorUrl();
  } catch (error) {
    if (error instanceof DriftMonitorUnavailableError) {
      return NextResponse.json(
        {
          error: "Drift monitor service is not configured.",
          code: "DRIFT_MONITOR_UNAVAILABLE"
        },
        { status: 503 }
      );
    }
    throw error;
  }

  // Build headers with service-to-service auth
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const serviceToken = getDriftMonitorApiToken();
  if (serviceToken) {
    headers["Authorization"] = `Bearer ${serviceToken}`;
  }

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
        // Return structured error without exposing backend details
        const status = res.status === 503 ? 503 : 502;
        return NextResponse.json(
          {
            error: "Swarm generation service returned an error.",
            code: status === 503 ? "DRIFT_MONITOR_UNAVAILABLE" : "DRIFT_MONITOR_ERROR"
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
    // Network errors — never expose internal URLs or error bodies
    console.error("[generate-swarm-attack] Drift monitor request failed.");
    console.error(error instanceof Error ? error.message : String(error));

    return NextResponse.json(
      {
        error: "Drift monitor service is unreachable.",
        code: "DRIFT_MONITOR_UNAVAILABLE"
      },
      { status: 503 }
    );
  }
}
