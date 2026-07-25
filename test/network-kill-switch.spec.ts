import { describe, expect, it, vi, afterEach } from "vitest";

describe("Test Network Kill Switch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks fetch to external AI hosts and includes only the hostname", async () => {
    const blockedUrls = [
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      "https://api.openai.com/v1/chat/completions",
      "https://api.anthropic.com/v1/messages"
    ];

    for (const url of blockedUrls) {
      const expectedHostname = new URL(url).hostname;

      const error = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer fake-secret-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: "sensitive-data" })
      }).then(
        () => null,
        (err: Error) => err
      );

      // Must have been blocked
      expect(error, `Expected fetch to ${expectedHostname} to be blocked`).toBeInstanceOf(Error);
      expect(error!.message).toContain("Test Network Kill Switch");
      expect(error!.message).toContain(expectedHostname);

      // Must NOT leak request body, auth tokens, or path details
      expect(error!.message).not.toContain("fake-secret-token");
      expect(error!.message).not.toContain("sensitive-data");
      expect(error!.message).not.toContain("/v1/");
    }
  });

  it("permits a scoped vi.spyOn mock and restores the blocker after mockRestore", async () => {
    // First, verify the blocker is active
    await expect(
      fetch("https://api.openai.com/v1/chat/completions")
    ).rejects.toThrow(/Blocked external fetch/);

    // Install a scoped mock that overrides the blocker
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ mocked: true }), { status: 200 })
    );

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ mocked: true });
    } finally {
      mockFetch.mockRestore();
    }

    // After mockRestore, the blocker must be back in effect
    await expect(
      fetch("https://api.openai.com/v1/chat/completions")
    ).rejects.toThrow(/Blocked external fetch/);
  });

  it("allows localhost requests through the blocker", async () => {
    // This should not throw — it reaches the real fetch for localhost.
    // The connection will likely fail (no server), but the blocker must not reject it.
    const error = await fetch("http://localhost:99999/test").then(
      () => null,
      (err: Error) => err
    );

    // If there's an error, it must NOT be from the kill switch
    if (error) {
      expect(error.message).not.toContain("Test Network Kill Switch");
    }
  });
});
