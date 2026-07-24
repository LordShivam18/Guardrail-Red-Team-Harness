import { beforeAll, afterAll } from "vitest";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlString = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input.url);
      const url = new URL(urlString);
      
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        return originalFetch(input, init);
      }
      
      throw new Error(`CI Network Kill Switch: Blocked external fetch to ${url.hostname}`);
    };
  }
});

afterAll(() => {
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") {
    globalThis.fetch = originalFetch;
  }
});
