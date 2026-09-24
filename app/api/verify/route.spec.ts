import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  sql: vi.fn(),
}));

import { sql } from "@/lib/db";
import { GET } from "./route";

const KNOWN_HASH = "a".repeat(64);

function getRequest(cert: string | null) {
  const url =
    cert === null
      ? "http://localhost:3000/api/verify"
      : `http://localhost:3000/api/verify?cert=${encodeURIComponent(cert)}`;

  return new Request(url, { method: "GET" });
}

describe("GET /api/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a malformed hash without implying cryptographic verification", async () => {
    const res = await GET(getRequest("not-a-hash"));
    const body = await res.json();

    expect(body).toEqual({
      verified: false,
      recordFound: false,
      cryptographicValidity: "NOT_VERIFIED",
      verificationLevel: "RECORD_EXISTENCE_V1",
    });
    expect(vi.mocked(sql)).not.toHaveBeenCalled();
  });

  it("reports unknown hashes as not found", async () => {
    vi.mocked(sql).mockResolvedValueOnce([]);

    const res = await GET(getRequest(KNOWN_HASH));
    const body = await res.json();

    expect(body).toEqual({
      verified: false,
      recordFound: false,
      cryptographicValidity: "NOT_VERIFIED",
      verificationLevel: "RECORD_EXISTENCE_V1",
    });
  });

  it("reports known hashes as record existence, explicitly not cryptographic proof", async () => {
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: "run-1",
        timestamp: new Date().toISOString(),
        model_version: "test-model",
        jailbreak_rate: 0,
        fp_rate: 0,
        certificate_hash: KNOWN_HASH,
        onchain_tx_hash: null,
        onchain_network: null,
      },
    ]);

    const res = await GET(getRequest(KNOWN_HASH));
    const body = await res.json();

    expect(body.verified).toBe(true);
    expect(body.recordFound).toBe(true);
    expect(body.cryptographicValidity).toBe("NOT_VERIFIED");
    expect(body.verificationLevel).toBe("RECORD_EXISTENCE_V1");
    expect(body.runDetails.certificateHash).toBe(KNOWN_HASH);
  });

  it("rejects a missing cert parameter", async () => {
    const res = await GET(getRequest(null));
    const body = await res.json();

    expect(body.verified).toBe(false);
    expect(body.verificationLevel).toBe("RECORD_EXISTENCE_V1");
  });
});
