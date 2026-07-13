"use server";

import { POST as anchorCompliance } from "@/app/api/compliance/onchain-anchor/route";
import { POST as proxyChatCompletion } from "@/app/api/proxy/v1/chat/completions/route";
import { GET as executiveComplianceReport } from "@/app/api/reports/executive-compliance/route";
import { POST as sandboxEvaluation } from "@/app/api/sandbox/route";
import { generateEvidencePack } from "@/lib/complianceEvidence";
import { requireOperatorSession } from "@/lib/operator-session";

type ActionResponse = { status: number; body: Record<string, unknown> };

export async function runSandboxAction(input: { prompt: string; targetModel?: string }): Promise<ActionResponse> {
  const identity = await requireOperatorSession();
  return invokeRoute(sandboxEvaluation, "/api/sandbox", input, identity.subject);
}

export async function runProxyChatAction(input: Record<string, unknown>): Promise<ActionResponse> {
  const identity = await requireOperatorSession();
  return invokeRoute(proxyChatCompletion, "/api/proxy/v1/chat/completions", input, identity.subject);
}

export async function getComplianceEvidenceAction(runId: string) {
  await requireOperatorSession();
  return generateEvidencePack(runId);
}

export async function anchorComplianceAction(runId: string): Promise<ActionResponse> {
  const identity = await requireOperatorSession();
  return invokeRoute(anchorCompliance, "/api/compliance/onchain-anchor", { runId }, identity.subject);
}

export async function getExecutiveComplianceReportAction(): Promise<ActionResponse> {
  await requireOperatorSession();
  const response = await executiveComplianceReport();
  const payload = (await response.json()) as unknown;
  return { status: response.status, body: isRecord(payload) ? payload : { error: "Invalid report response." } };
}

async function invokeRoute(
  handler: typeof anchorCompliance | typeof proxyChatCompletion | typeof sandboxEvaluation,
  path: string,
  body: Record<string, unknown>,
  subject: string
): Promise<ActionResponse> {
  const response = await handler(
    new Request(`https://operator.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `operator:${subject}` },
      body: JSON.stringify(body)
    })
  );
  const payload = (await response.json()) as unknown;
  return { status: response.status, body: isRecord(payload) ? payload : { error: "Invalid route response." } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
