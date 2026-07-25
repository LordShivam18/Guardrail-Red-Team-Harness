import { afterAll, beforeAll } from "vitest";

const originalFetch = globalThis.fetch;

/**
 * Create a fetch wrapper that blocks all external network requests.
 * Only localhost, 127.0.0.1, and ::1 are permitted.
 *
 * Exported so tests can verify its behavior directly.
 */
export function createNetworkBlockedFetch(
  allowedFetch: typeof globalThis.fetch
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlString =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const url = new URL(urlString);
    const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);

    if (allowedHosts.has(url.hostname)) {
      return allowedFetch(input, init);
    }

    throw new Error(
      `Test Network Kill Switch: Blocked external fetch to ${url.hostname}`
    );
  };
}

beforeAll(() => {
  globalThis.fetch = createNetworkBlockedFetch(originalFetch);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
