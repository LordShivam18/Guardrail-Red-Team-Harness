import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

describe("CI Network Kill Switch", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Note: The kill switch is installed via vitest.setup.ts on load.
    // We simulate CI env being active (which the setup file does for us, or we just rely on vitest.setup.ts).
    process.env = { ...originalEnv, CI: "true" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("blocks fetch to external AI hosts and includes the hostname without leaking data", async () => {
    const blockedHosts = [
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      "https://api.openai.com/v1/chat/completions",
      "https://api.anthropic.com/v1/messages"
    ];

    for (const host of blockedHosts) {
      await expect(
        fetch(host, {
          method: "POST",
          headers: {
            "Authorization": "Bearer fake-secret-token",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ prompt: "hello" })
        })
      ).rejects.toThrowError(new RegExp(`CI Network Kill Switch: Blocked external fetch to ${new URL(host).hostname}`));
    }
  });

  it("permits an explicitly scoped mockFetch", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await fetch("https://api.openai.com/v1/chat/completions");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    
    mockFetch.mockRestore();
    
    // After restore, it should be blocked again
    await expect(fetch("https://api.openai.com/v1/chat/completions")).rejects.toThrow(/Blocked external fetch/);
  });
});
