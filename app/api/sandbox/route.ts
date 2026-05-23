import { NextResponse } from "next/server";
import { guardedResponse } from "@/agents/guardedAgent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PROMPT_LENGTH = 1_999;
const MAX_TARGET_MODEL_LENGTH = 120;

type SandboxSignals = {
  blockReason: string | null;
  regex: {
    creditCardCandidate: boolean;
    emailAddress: boolean;
    piiKeyword: boolean;
    bypassKeyword: boolean;
  };
  toxicity: {
    evaluated: boolean;
    matches: {
      label: string;
      confidence: number;
    }[];
  };
  sanitizer: {
    changed: boolean;
    redactedCreditCard: boolean;
    redactedEmail: boolean;
  };
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTargetModel(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("Field `targetModel` must be a string when provided.");
  }

  const targetModel = value.trim();

  if (!targetModel) {
    return undefined;
  }

  if (targetModel.length > MAX_TARGET_MODEL_LENGTH) {
    throw new Error("Field `targetModel` must be 120 characters or fewer.");
  }

  return targetModel;
}

function getRegexSignals(prompt: string) {
  return {
    creditCardCandidate: /\b(?:\d[ -]*?){13,19}\b/.test(prompt),
    emailAddress: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(prompt),
    piiKeyword: /\b(?:pii|ssn|social security|credit card|email|phone)\b/i.test(prompt),
    bypassKeyword: /\b(?:bypass|override|developer mode|system prompt|ignore previous)\b/i.test(
      prompt
    )
  };
}

function getSandboxSignals(
  prompt: string,
  response: Awaited<ReturnType<typeof guardedResponse>>
): SandboxSignals {
  return {
    blockReason: response.blockReason ?? null,
    regex: getRegexSignals(prompt),
    toxicity: {
      evaluated: Array.isArray(response.toxicityMatches),
      matches: (response.toxicityMatches ?? []).map((match) => ({
        label: match.label,
        confidence: Number(match.probability.toFixed(4))
      }))
    },
    sanitizer: {
      changed: response.rawOutput !== response.finalOutput,
      redactedCreditCard: response.finalOutput.includes("[REDACTED_CREDIT_CARD]"),
      redactedEmail: response.finalOutput.includes("[REDACTED_EMAIL]")
    }
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isJsonRecord(body) || typeof body.prompt !== "string") {
    return NextResponse.json(
      { error: "Field `prompt` must be a string." },
      { status: 400 }
    );
  }

  const prompt = body.prompt;
  let targetModel: string | undefined;

  if (prompt.trim().length === 0) {
    return NextResponse.json(
      { error: "Field `prompt` must be a non-empty string." },
      { status: 400 }
    );
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: "Field `prompt` must be under 2000 characters." },
      { status: 413 }
    );
  }

  try {
    targetModel = parseTargetModel(body.targetModel);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid `targetModel`." },
      { status: 400 }
    );
  }

  try {
    const startedAt = performance.now();
    const response = await guardedResponse(prompt, { forceLive: true, targetModel });
    const latency = Math.round(performance.now() - startedAt);

    return NextResponse.json({
      prompt,
      targetModel: response.modelName,
      output: response.finalOutput,
      blocked: response.blocked,
      latency,
      signals: getSandboxSignals(prompt, response)
    });
  } catch (error) {
    console.error("[sandbox] Interactive evaluation failed.");
    console.error(error);

    return NextResponse.json(
      { error: "Sandbox evaluation failed." },
      { status: 500 }
    );
  }
}
