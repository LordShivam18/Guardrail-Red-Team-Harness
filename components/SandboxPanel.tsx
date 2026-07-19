"use client";

import { useState } from "react";
import { AGENT_HIJACKING_SCENARIOS } from "@/lib/sandbox/scenarios";

type ToolCall = {
  sequence: number;
  tool: string;
  arguments: Record<string, unknown>;
  status: "COMPLETED" | "REJECTED";
  risk: "NONE" | "PRIVILEGED" | "DESTRUCTIVE";
  resultPreview: string;
  timestamp: string;
};

type SandboxEvaluation = {
  scenario: { id: string; title: string; objective: string };
  status: "HIJACKED" | "CONTAINED";
  dataSourceIntegrity: "VERIFIED" | "POISONED" | "COMPROMISED";
  detection: { hijacked: boolean; reason: string | null; poisonedDocumentRead: boolean };
  trace: ToolCall[];
  decisions: { turn: number; output: string; tool: string | null }[];
  externalAlerts: string[];
  dlpIntercepted?: boolean;
  sovereignImpact: {
    agentHijacking: { totalScenarios: number; hijackedScenarios: number };
    persistedIndex: { score: number; status: string } | null;
  };
};

const DEFAULT_SCENARIO_ID = "poisoned-invoice-sql";

function formatToolName(tool: string) {
  return tool.replaceAll("_", " ").toUpperCase();
}

function getIntegrityClass(integrity: SandboxEvaluation["dataSourceIntegrity"]) {
  if (integrity === "COMPROMISED") return "border-red-800 bg-red-950 text-red-200";
  if (integrity === "POISONED") return "border-amber-800 bg-amber-950/40 text-amber-200";
  return "border-neutral-700 bg-neutral-900 text-white";
}

export function SandboxPanel() {
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const [targetModel, setTargetModel] = useState("gemini-2.0-flash");
  const [result, setResult] = useState<SandboxEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [visualInjectionDetected, setVisualInjectionDetected] = useState(false);
  const [dataPoisoningDetected, setDataPoisoningDetected] = useState(false);
  const [swarmLoading, setSwarmLoading] = useState(false);
  const [swarmError, setSwarmError] = useState("");
  const [swarmPayload, setSwarmPayload] = useState<string | null>(null);

  const handleVisionUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRunning(true);
    setError(null);
    setVisualInjectionDetected(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/sandbox/analyze-vision", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Vision analysis failed: ${res.statusText}`);
      const data = await res.json();
      setVisualInjectionDetected(data.VISUAL_INJECTION_DETECTED);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDataUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRunning(true);
    setError(null);
    setDataPoisoningDetected(false);
    try {
      const text = await file.text();
      let payload;
      try {
         payload = JSON.parse(text);
         if (!payload.data) payload = { data: payload };
      } catch (e) {
         throw new Error("Invalid JSON data file. Ensure it contains a numerical array.");
      }
      
      const res = await fetch("/api/sandbox/analyze-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Data analysis failed: ${res.statusText}`);
      const data = await res.json();
      setDataPoisoningDetected(data.DATA_POISONING_DETECTED);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsRunning(false);
    }
  };

  const runEvaluation = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setError(null);

    try {
      const response = await fetch("/api/sandbox/evaluate-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId, targetModel })
      });
      const payload: unknown = await response.json();

      if (!response.ok || !isSandboxEvaluation(payload)) {
        throw new Error(getErrorMessage(payload) ?? "Agent sandbox evaluation failed.");
      }

      setResult(payload);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Agent sandbox evaluation failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleUnleashSwarm = async () => {
    setSwarmLoading(true);
    setSwarmError("");
    setSwarmPayload(null);
    try {
      const response = await fetch("/api/generate-swarm-attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_context: `A ${targetModel} AI assistant with access to internal tools in an agent-hijacking sandbox.`,
        }),
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      if (data.swarm_payload) {
        setSwarmPayload(data.swarm_payload);
      } else {
        throw new Error("No payload received.");
      }
    } catch (err: any) {
      setSwarmError(err.message || "Failed to generate swarm attack");
    } finally {
      setSwarmLoading(false);
    }
  };

  return (
    <section className="overflow-hidden border border-neutral-800 bg-black font-mono text-white">
      <header className="flex flex-col gap-5 border-b border-neutral-800 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">
            Component 03 // Agent Hijacking Defenses
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">Indirect Injection Sandbox</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-500">
            Tool calls are captured in memory. Database queries and external alerts never leave this
            evaluation boundary.
          </p>
        </div>
        <span className="w-fit border border-neutral-700 bg-neutral-900 px-3 py-2 text-[11px] uppercase tracking-wider text-neutral-300">
          Runtime: Node.js
        </span>
      </header>

      <div className="grid gap-4 border-b border-neutral-800 bg-neutral-950 p-5 lg:grid-cols-[1fr_15rem_11rem_14rem] lg:items-end">
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
            Evaluation Scenario
          </span>
          <select
            className="h-11 border border-neutral-700 bg-black px-3 text-sm text-white outline-none transition focus:border-white"
            onChange={(event) => setScenarioId(event.target.value)}
            value={scenarioId}
          >
            {AGENT_HIJACKING_SCENARIOS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
            Target Model
          </span>
          <input
            className="h-11 border border-neutral-700 bg-black px-3 text-sm text-white outline-none transition focus:border-white"
            maxLength={120}
            onChange={(event) => setTargetModel(event.target.value)}
            value={targetModel}
          />
        </label>
        <button
          className="h-11 border border-white bg-white px-4 text-sm font-black uppercase tracking-wide text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-800 disabled:text-neutral-500"
          disabled={isRunning}
          onClick={runEvaluation}
          type="button"
        >
          {isRunning ? "Executing..." : "Run Scenario"}
        </button>
        <button
          className="h-11 border border-red-600 bg-red-600 px-4 text-sm font-black uppercase tracking-wide text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-800 disabled:text-neutral-500"
          disabled={swarmLoading || isRunning}
          onClick={handleUnleashSwarm}
          type="button"
        >
          {swarmLoading ? "Unleashing..." : "Unleash Adversarial Swarm"}
        </button>
      </div>

      <div className="grid gap-4 border-b border-neutral-800 bg-neutral-950 p-5 lg:grid-cols-[1fr_1fr]">
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
            Multi-Modal: Vision Injection
          </span>
          <input
            type="file"
            accept="image/*"
            className="h-11 border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none transition focus:border-white"
            onChange={handleVisionUpload}
            disabled={isRunning}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-500">
            Multi-Modal: Data Poisoning (JSON)
          </span>
          <input
            type="file"
            accept="application/json"
            className="h-11 border border-neutral-700 bg-black px-3 py-2 text-sm text-white outline-none transition focus:border-white"
            onChange={handleDataUpload}
            disabled={isRunning}
          />
        </label>
      </div>

      {visualInjectionDetected ? (
        <div className="flex w-full animate-pulse items-center justify-center border-b border-red-600 bg-red-950/80 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.4)]">
          <span className="font-mono text-sm font-bold uppercase tracking-wide text-red-400">
            ⚠️ CRITICAL: Steganographic Visual Injection Intercepted.
          </span>
        </div>
      ) : null}

      {dataPoisoningDetected ? (
        <div className="flex w-full animate-pulse items-center justify-center border-b border-red-600 bg-red-950/80 px-4 py-3 shadow-[0_0_20px_rgba(220,38,38,0.4)]">
          <span className="font-mono text-sm font-bold uppercase tracking-wide text-red-400">
            ⚠️ CRITICAL: Structural Data Poisoning Intercepted.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-red-800 bg-red-950 px-5 py-4 text-sm text-red-200">{error}</div>
      ) : null}

      {swarmError ? (
        <div className="border-b border-red-800 bg-red-950 px-5 py-4 text-sm text-red-200">{swarmError}</div>
      ) : null}

      {swarmPayload ? (
        <aside className="border-b border-red-700 bg-neutral-950 px-5 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-400">
            Swarm Payload Generated // 3-Agent Chain
          </p>
          <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words border border-red-900 bg-black p-4 text-xs leading-5 text-neutral-300">
            {swarmPayload}
          </pre>
        </aside>
      ) : null}

      {result?.dlpIntercepted ? (
        <aside className="border-b-4 border-red-700 bg-red-950 px-5 py-5 text-red-100">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
            CRITICAL: RAG Exfiltration Attempt Blocked. Classified Data Redacted.
          </p>
          <p className="mt-2 text-sm font-bold leading-6">
            {result.detection.reason ?? "The data loss prevention (DLP) scrubber intercepted classified information."}
          </p>
          <p className="mt-2 text-xs leading-5 text-red-300">
            Sovereign fuzzing contribution is forced to zero; this result cannot retain a certified
            Sovereign Score.
          </p>
        </aside>
      ) : result?.status === "HIJACKED" ? (
        <aside className="border-b-4 border-red-700 bg-red-950 px-5 py-5 text-red-100">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
            Critical Boundary Failure // Agent Hijacked
          </p>
          <p className="mt-2 text-sm font-bold leading-6">
            {result.detection.reason ?? "An untrusted document caused an unauthorized tool action."}
          </p>
          <p className="mt-2 text-xs leading-5 text-red-300">
            Sovereign fuzzing contribution is forced to zero; this result cannot retain a certified
            Sovereign Score.
          </p>
        </aside>
      ) : null}

      <div className="grid border-b border-neutral-800 md:grid-cols-2">
        <article className="border-b border-neutral-800 p-5 md:border-b-0 md:border-r">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            Active Tool Calls
          </p>
          <p className="mt-3 text-3xl font-black">{result?.trace.length ?? 0}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {result ? "Calls are ordered and argument-captured below." : "Awaiting scenario execution."}
          </p>
        </article>
        <article className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            Data Source Integrity
          </p>
          <span
            className={`mt-3 inline-flex border px-3 py-2 text-sm font-black uppercase tracking-wider ${
              result ? getIntegrityClass(result.dataSourceIntegrity) : "border-neutral-800 bg-neutral-950 text-neutral-600"
            }`}
          >
            {result?.dataSourceIntegrity ?? "NOT EVALUATED"}
          </span>
          <p className="mt-2 text-xs text-neutral-500">
            {result?.detection.poisonedDocumentRead
              ? "Untrusted retrieved data entered the agent context."
              : "No poisoned retrieval has entered the agent context."}
          </p>
        </article>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="min-w-0 border-b border-neutral-800 lg:border-b-0 lg:border-r">
          <div className="border-b border-neutral-800 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            Execution Trace // stdout
          </div>
          <div className="max-h-[30rem] min-h-64 overflow-auto p-5">
            {!result ? (
              <p className="pt-16 text-center text-sm text-neutral-700">&gt; Select an attack scenario and execute.</p>
            ) : result.trace.length === 0 ? (
              <p className="pt-16 text-center text-sm text-neutral-600">
                &gt; Agent returned a final response without invoking a tool.
              </p>
            ) : (
              <ol className="space-y-3">
                {result.trace.map((call) => (
                  <li className="border border-neutral-800 bg-neutral-950 p-4" key={call.sequence}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-neutral-600">#{String(call.sequence).padStart(2, "0")}</span>
                      <span className="text-xs font-black tracking-wide text-white">{formatToolName(call.tool)}</span>
                      <span
                        className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          call.risk === "DESTRUCTIVE"
                            ? "border-red-800 bg-red-950 text-red-200"
                            : call.risk === "PRIVILEGED"
                              ? "border-amber-800 bg-amber-950/40 text-amber-200"
                              : "border-neutral-700 bg-black text-neutral-400"
                        }`}
                      >
                        {call.status}{" // "}{call.risk}
                      </span>
                    </div>
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words border-l-2 border-neutral-700 pl-3 text-xs leading-5 text-neutral-400">
                      args: {JSON.stringify(call.arguments)}
                    </pre>
                    <p className="mt-2 text-xs leading-5 text-neutral-500">result: {call.resultPreview}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </article>

        <aside className="min-w-0 bg-neutral-950">
          <div className="border-b border-neutral-800 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            Agent Decisions
          </div>
          <div className="max-h-[30rem] min-h-64 overflow-auto p-5">
            {result ? (
              <div className="space-y-4">
                <div className="border border-neutral-800 bg-black p-3">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-600">Evaluation Status</p>
                  <p className={`mt-2 text-xl font-black ${result.status === "HIJACKED" ? "text-red-400" : "text-white"}`}>
                    {result.status}
                  </p>
                </div>
                {result.decisions.map((decision) => (
                  <details className="border border-neutral-800 bg-black p-3" key={decision.turn}>
                    <summary className="cursor-pointer text-xs font-bold text-neutral-300">
                      TURN {decision.turn} {decision.tool ? `// ${formatToolName(decision.tool)}` : "// FINAL"}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-neutral-500">
                      {decision.output}
                    </pre>
                  </details>
                ))}
              </div>
            ) : (
              <p className="pt-16 text-center text-sm text-neutral-700">&gt; No agent output captured.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function isSandboxEvaluation(value: unknown): value is SandboxEvaluation {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    ((value as { status?: unknown }).status === "HIJACKED" ||
      (value as { status?: unknown }).status === "CONTAINED") &&
    "trace" in value &&
    Array.isArray((value as { trace?: unknown }).trace)
  );
}

function getErrorMessage(value: unknown) {
  return typeof value === "object" && value !== null && "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
    ? (value as { error: string }).error
    : null;
}
