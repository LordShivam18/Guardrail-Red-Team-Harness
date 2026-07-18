import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/crypto";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DRIFT_EVENT = "model.drift_detected";

type DriftWebhookBody = {
  event?: unknown;
  model_version?: unknown;
  modelVersion?: unknown;
};

type UpdatedRunRow = {
  model_version: string;
  model_status: "PENDING_REASSESSMENT";
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalModelVersion(body: DriftWebhookBody) {
  const value = body.model_version ?? body.modelVersion;

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("model_version must be a string when supplied.");
  }

  const modelVersion = value.trim();

  if (!modelVersion || modelVersion.length > 255) {
    throw new Error("model_version must contain 1-255 characters when supplied.");
  }

  return modelVersion;
}

export async function POST(request: Request) {
  const rawPayload = await request.text();
  const signature = request.headers.get("x-mesh-signature")?.trim() ?? "";
  const webhookSecret = process.env.DRIFT_WEBHOOK_SECRET?.trim() ?? "";

  if (
    !webhookSecret ||
    !signature ||
    !verifyWebhookSignature(rawPayload, signature, webhookSecret)
  ) {
    return NextResponse.json(
      {
        error: "INVALID_SIGNATURE",
        message: "Drift webhook authentication failed."
      },
      { status: 403 }
    );
  }

  let rawBody: unknown;

  try {
    rawBody = JSON.parse(rawPayload) as unknown;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isJsonRecord(rawBody)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  try {
    const body = rawBody as DriftWebhookBody;

    if (body.event !== DRIFT_EVENT) {
      return NextResponse.json({ error: "Unsupported drift webhook event." }, { status: 400 });
    }

    const requestedModelVersion = parseOptionalModelVersion(body);
    const rows = (await sql`
      with active_model as (
        select model_version
        from redteam_runs
        where model_status = 'VERIFIED'
          and (
            ${requestedModelVersion}::text is null
            or model_version = ${requestedModelVersion}
          )
        order by timestamp desc, created_at desc, id desc
        limit 1
      )
      update redteam_runs as runs
      set model_status = 'PENDING_REASSESSMENT'
      from active_model
      where runs.model_version = active_model.model_version
        and runs.model_status = 'VERIFIED'
      returning runs.model_version, runs.model_status
    `) as UpdatedRunRow[];

    const modelVersion = rows[0]?.model_version ?? requestedModelVersion;

    return NextResponse.json({
      success: true,
      modelVersion,
      modelStatus: rows[0]?.model_status ?? "PENDING_REASSESSMENT",
      updatedRuns: rows.length
    });
  } catch (error) {
    console.error("[webhooks:drift] Failed to mark the active model for reassessment.");
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to process the drift webhook."
      },
      { status: 500 }
    );
  }
}
