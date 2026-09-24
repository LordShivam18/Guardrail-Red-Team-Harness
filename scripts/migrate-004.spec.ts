import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  tag: vi.fn(),
  neon: vi.fn(),
  loadLocalEnv: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (...args: unknown[]) => {
    mocks.neon(...args);

    const tag = (...tagArgs: unknown[]) => mocks.tag(...tagArgs);

    return Object.assign(tag, { query: mocks.query });
  },
}));

vi.mock("./env", () => ({
  loadLocalEnv: (...args: unknown[]) => mocks.loadLocalEnv(...args),
}));

const TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

describe("migrate-004 runner", () => {
  let previousDatabaseUrl: string | undefined;
  let previousExitCode: number | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    previousDatabaseUrl = process.env.DATABASE_URL;
    previousExitCode = process.exitCode;
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    // information_schema verification selects always find their objects.
    mocks.tag.mockResolvedValue([{ found: 1 }]);
    mocks.query.mockResolvedValue([]);
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    process.exitCode = previousExitCode;
  });

  async function runMigrationOnce() {
    await import("./migrate-004");
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(mocks.tag).toHaveBeenCalledTimes(3));
  }

  it("splits 004_phase9_modality.sql into 3 statements in deterministic order", async () => {
    await runMigrationOnce();

    const statements = mocks.query.mock.calls.map((call) => String(call[0]));

    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/alter table redteam_results/i);
    expect(statements[0]).toMatch(/add column if not exists modality/i);
    expect(statements[1]).toMatch(/alter table adversarial_prompts/i);
    expect(statements[1]).toMatch(/add column if not exists modality/i);
    expect(statements[2]).toMatch(/create table if not exists agentic_tool_sequences/i);
    // Each statement is a single PostgreSQL statement (no embedded semicolons).
    for (const statement of statements) {
      expect(statement).not.toContain(";");
    }
  });

  it("runs information_schema verification after all statements", async () => {
    await runMigrationOnce();

    expect(mocks.tag).toHaveBeenCalledTimes(3);

    const lastStatementOrder = Math.max(
      ...mocks.query.mock.invocationCallOrder,
    );
    const firstVerificationOrder = Math.min(...mocks.tag.mock.invocationCallOrder);

    expect(firstVerificationOrder).toBeGreaterThan(lastStatementOrder);
  });

  it("remains safe to run twice (idempotent SQL re-applied verbatim)", async () => {
    await runMigrationOnce();
    const firstRun = mocks.query.mock.calls.map((call) => String(call[0]));

    vi.clearAllMocks();
    mocks.tag.mockResolvedValue([{ found: 1 }]);
    mocks.query.mockResolvedValue([]);
    vi.resetModules();
    await import("./migrate-004");
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(3));

    const secondRun = mocks.query.mock.calls.map((call) => String(call[0]));

    expect(secondRun).toEqual(firstRun);
    for (const statement of secondRun) {
      expect(statement.toLowerCase()).toContain("if not exists");
    }
  });
});
