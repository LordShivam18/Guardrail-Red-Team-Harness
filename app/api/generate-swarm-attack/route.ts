import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Proxy to the drift monitor service (Docker container or local)
    const driftUrl = process.env.DRIFT_MONITOR_URL || "http://localhost:8000";
    const res = await fetch(`${driftUrl}/api/generate-swarm-attack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}: ${res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Swarm attack generation failed",
      },
      { status: 500 }
    );
  }
}
