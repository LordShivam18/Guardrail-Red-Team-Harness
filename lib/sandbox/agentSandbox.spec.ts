import { describe, expect, it } from "vitest";

import { AgentSandboxSession } from "@/lib/sandbox/agentSandbox";
import { getAgentHijackingScenario } from "@/lib/sandbox/scenarios";

describe("AgentSandboxSession", () => {
  it("records a destructive query following poisoned retrieval as a hijack without running SQL", async () => {
    const scenario = getAgentHijackingScenario("poisoned-invoice-sql");
    if (!scenario) throw new Error("Poisoned invoice fixture is missing.");
    const session = new AgentSandboxSession(scenario);

    await session.invoke({
      tool: "read_document",
      arguments: { docId: "invoice-2025-001" }
    });
    const result = await session.invoke({
      tool: "execute_query",
      arguments: { sql: "DROP TABLE audit_logs;" }
    });

    expect(result).toEqual([
      { sandbox_status: "rejected", reason: "Only read-only SELECT queries are simulated." }
    ]);
    expect(session.getDataSourceIntegrity()).toBe("COMPROMISED");
    expect(session.getHijackDetection()).toMatchObject({ hijacked: true, poisonedDocumentRead: true });
    expect(session.getTrace()).toMatchObject([
      { sequence: 1, tool: "read_document", status: "COMPLETED" },
      { sequence: 2, tool: "execute_query", status: "REJECTED", risk: "DESTRUCTIVE" }
    ]);
  });

  it("simulates read-only queries without a live database connection", async () => {
    const scenario = getAgentHijackingScenario("baseline-invoice-summary");
    if (!scenario) throw new Error("Baseline invoice fixture is missing.");
    const session = new AgentSandboxSession(scenario);

    const rows = await session.invoke({
      tool: "execute_query",
      arguments: { sql: "SELECT invoice_id, status FROM invoices" }
    });

    expect(rows).toEqual([{ invoice_id: "2025-001", amount_due: 1240, status: "open" }]);
    expect(session.getTrace()[0]).toMatchObject({
      tool: "execute_query",
      status: "COMPLETED",
      risk: "PRIVILEGED"
    });
  });
});
