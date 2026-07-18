import { createSign, generateKeyPairSync, type JsonWebKey } from "crypto";

export type AssertionPublicKey = JsonWebKey & {
  kid: string;
  use: "sig";
  alg: "ES256";
};

/**
 * Contract implemented by AWS KMS, an HSM adapter, or the ephemeral local
 * backend below. A production adapter must bind this operation to a KMS key
 * configured exclusively for SIGN_VERIFY.
 */
export interface AsymmetricSigningBackend {
  sign(_payload: string): Promise<Uint8Array>;
  getPublicKey(): AssertionPublicKey;
}

class EphemeralEcdsaBackend implements AsymmetricSigningBackend {
  private readonly keyPair = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });

  async sign(payload: string): Promise<Uint8Array> {
    const signer = createSign("SHA256");
    signer.update(payload, "utf8");
    signer.end();
    return signer.sign(this.keyPair.privateKey);
  }

  getPublicKey(): AssertionPublicKey {
    const key = this.keyPair.publicKey.export({ format: "jwk" }) as JsonWebKey;

    return {
      ...key,
      kid: "did:web:guardrail-mesh.local#assertion-1",
      use: "sig",
      alg: "ES256",
    };
  }
}

/**
 * Normalized interface for sovereign credential signing. By default it uses a
 * process-local, throwaway P-256 key solely for local development and tests.
 */
export class KmsSigner {
  private readonly backend: AsymmetricSigningBackend;

  constructor(_backend: AsymmetricSigningBackend = new EphemeralEcdsaBackend()) {
    this.backend = _backend;
  }

  async signDigest(payload: string): Promise<string> {
    const signature = await this.backend.sign(payload);
    return Buffer.from(signature).toString("base64url");
  }

  getPublicKey(): AssertionPublicKey {
    return this.backend.getPublicKey();
  }
}

/** One issuer identity per running service instance. Replace via KMS in production. */
export const sovereignIssuerSigner = new KmsSigner();

/** Deterministic serialization for the exact VC assertion that is signed. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Only finite numbers may be signed in a credential.");
    }

    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`)
      .join(",")}}`;
  }

  throw new TypeError("Unsupported credential value.");
}
