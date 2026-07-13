import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/crypto";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RegistryPostBody = {
  modelVersion?: unknown;
  model_version?: unknown;
  model_endpoint?: unknown;
  meshScore?: unknown;
  mesh_score?: unknown;
  certificateHash?: unknown;
  certificate_hash?: unknown;
  jailbreakRate?: unknown;
  jailbreak_rate?: unknown;
  fpRate?: unknown;
  fp_rate?: unknown;
  safetySharpe?: unknown;
  safety_sharpe?: unknown;
  safetyMean?: unknown;
  safety_mean?: unknown;
  safetyVariance?: unknown;
  safety_variance?: unknown;
  metrics?: unknown;
};

type RegistryMetrics = {
  fp_rate?: unknown;
  fpRate?: unknown;
  jailbreak_rate?: unknown;
  jailbreakRate?: unknown;
  mesh_score?: unknown;
  meshScore?: unknown;
  safety_mean?: unknown;
  safetyMean?: unknown;
  safety_sharpe?: unknown;
  safetySharpe?: unknown;
  safety_variance?: unknown;
  safetyVariance?: unknown;
};

type InsertedRunRow = {
  certificate_hash: string;
};

const INVALID_SIGNATURE_RESPONSE = {
  error: "INVALID_SIGNATURE",
  message: "Cryptographic signature verification failed. Submission rejected."
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetrics(body: RegistryPostBody): RegistryMetrics {
  return isJsonRecord(body.metrics) ? (body.metrics as RegistryMetrics) : {};
}

function getFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getFirstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function validateRate(value: number | null, fieldName: string) {
  if (value === null || value < 0 || value > 1) {
    throw new Error(`${fieldName} must be a number between 0 and 1.`);
  }

  return value;
}

function validateMeshScore(value: number | null) {
  if (value === null || value < 0 || value > 1000) {
    throw new Error("meshScore must be a number between 0 and 1000.");
  }

  return value;
}

function validateOptionalNonNegative(value: number | null, fieldName: string) {
  if (value === null) {
    return 0;
  }

  if (value < 0) {
    throw new Error(`${fieldName} must be non-negative.`);
  }

  return value;
}

function validateOptionalFinite(value: number | null) {
  return value ?? 0;
}

function validateOptionalRate(value: number | null, fieldName: string) {
  if (value === null) {
    return 0;
  }

  return validateRate(value, fieldName);
}

function validateModelVersion(value: string | null) {
  if (!value) {
    throw new Error("modelVersion is required.");
  }

  if (value.length > 200) {
    throw new Error("modelVersion must be 200 characters or fewer.");
  }

  return value;
}

function validateCertificateHash(value: string | null) {
  if (!value) {
    throw new Error("certificateHash is required.");
  }

  const normalized = value.toLowerCase();

  if (!/^[a-f0-9]{8,128}$/.test(normalized)) {
    throw new Error("certificateHash must be an 8-128 character hexadecimal string.");
  }

  return normalized;
}

export async function POST(request: Request) {
  const rawPayload = await request.text();
  const signature = request.headers.get("x-mesh-signature")?.trim() ?? "";
  const registrySecret = process.env.REGISTRY_TENANT_SECRET?.trim() ?? "";

  if (
    !signature ||
    !registrySecret ||
    !verifyWebhookSignature(rawPayload, signature, registrySecret)
  ) {
    return NextResponse.json(INVALID_SIGNATURE_RESPONSE, { status: 403 });
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
    const body = rawBody as RegistryPostBody;
    const metrics = getMetrics(body);
    const modelVersion = validateModelVersion(
      getFirstString(body.modelVersion, body.model_version, body.model_endpoint)
    );
    const meshScore = validateMeshScore(
      getFirstNumber(body.meshScore, body.mesh_score, metrics.meshScore, metrics.mesh_score)
    );
    const certificateHash = validateCertificateHash(
      getFirstString(body.certificateHash, body.certificate_hash)
    );
    const jailbreakRate = validateRate(
      getFirstNumber(
        body.jailbreakRate,
        body.jailbreak_rate,
        metrics.jailbreakRate,
        metrics.jailbreak_rate
      ),
      "jailbreakRate"
    );
    const fpRate = validateRate(
      getFirstNumber(body.fpRate, body.fp_rate, metrics.fpRate, metrics.fp_rate),
      "fpRate"
    );
    const safetySharpe = validateOptionalFinite(
      getFirstNumber(
        body.safetySharpe,
        body.safety_sharpe,
        metrics.safetySharpe,
        metrics.safety_sharpe
      )
    );
    const safetyMean = validateOptionalRate(
      getFirstNumber(body.safetyMean, body.safety_mean, metrics.safetyMean, metrics.safety_mean),
      "safetyMean"
    );
    const safetyVariance = validateOptionalNonNegative(
      getFirstNumber(
        body.safetyVariance,
        body.safety_variance,
        metrics.safetyVariance,
        metrics.safety_variance
      ),
      "safetyVariance"
    );

    const rows = (await sql`
      insert into redteam_runs (
        model_version,
        jailbreak_rate,
        fp_rate,
        safety_mean,
        safety_variance,
        safety_sharpe,
        certificate_hash
      )
      values (
        ${modelVersion},
        ${jailbreakRate},
        ${fpRate},
        ${safetyMean},
        ${safetyVariance},
        ${safetySharpe},
        ${certificateHash}
      )
      on conflict (certificate_hash)
        where certificate_hash is not null
        do update set
          model_version = excluded.model_version,
          jailbreak_rate = excluded.jailbreak_rate,
          fp_rate = excluded.fp_rate,
          safety_mean = excluded.safety_mean,
          safety_variance = excluded.safety_variance,
          safety_sharpe = excluded.safety_sharpe
      returning certificate_hash
    `) as InsertedRunRow[];
    const inserted = rows[0];

    if (!inserted) {
      throw new Error("Registry insert returned no row.");
    }

    return NextResponse.json({
      success: true,
      hash: inserted.certificate_hash,
      meshScore
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Registry ingestion failed."
      },
      { status: 400 }
    );
  }
}
