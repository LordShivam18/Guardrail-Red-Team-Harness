export type OperatorIdentity = {
  subject: string;
  scopes: string[];
  roles: string[];
};

type JwtPayload = Record<string, unknown>;

const REQUIRED_SCOPE = "mesh:operator";
const CLOCK_SKEW_SECS = 60;
export const OPERATOR_SESSION_TTL_SECS = 60 * 60;

export async function verifyOperatorToken(token: string): Promise<OperatorIdentity | null> {
  const secret = process.env.MESH_AUTH_TOKEN_SECRET;
  const issuer = process.env.MESH_AUTH_ISSUER;
  const audience = process.env.MESH_AUTH_AUDIENCE;

  if (!secret || !issuer || !audience || secret.length < 32) return null;

  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseJsonSegment(encodedHeader);
  const payload = parseJsonSegment(encodedPayload);

  if (
    !header ||
    !payload ||
    header.alg !== "HS256" ||
    header.typ !== "JWT" ||
    !(await verifyHs256(`${encodedHeader}.${encodedPayload}`, encodedSignature, secret))
  ) return null;

  const now = Math.floor(Date.now() / 1_000);
  const expiresAt = payload.exp;
  const notBefore = payload.nbf;
  const subject = payload.sub;

  if (
    typeof subject !== "string" ||
    !subject.trim() ||
    payload.iss !== issuer ||
    !audienceIncludes(payload.aud, audience) ||
    typeof expiresAt !== "number" ||
    expiresAt <= now - CLOCK_SKEW_SECS ||
    (typeof notBefore === "number" && notBefore > now + CLOCK_SKEW_SECS)
  ) return null;

  const scopes = normalizeClaimList(payload.scope);
  const roles = normalizeClaimList(payload.roles);
  if (!scopes.includes(REQUIRED_SCOPE) && !roles.includes("operator") && !roles.includes("admin")) {
    return null;
  }

  return { subject: subject.trim(), scopes, roles };
}

export function getBearerToken(authorization: string | null): string | null {
  const match = authorization
    ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization)
    : null;
  return match?.[1] ?? null;
}

/**
 * Creates the same short-lived HS256 token accepted by middleware. This is
 * intentionally server-invoked only; no signing secret is sent to a browser.
 */
export async function createOperatorSessionToken(
  subject = "local-operator",
): Promise<string | null> {
  const secret = process.env.MESH_AUTH_TOKEN_SECRET;
  const issuer = process.env.MESH_AUTH_ISSUER;
  const audience = process.env.MESH_AUTH_AUDIENCE;

  if (!secret || !issuer || !audience || secret.length < 32 || !subject.trim()) {
    return null;
  }

  const now = Math.floor(Date.now() / 1_000);
  const encodedHeader = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: subject.trim(),
        iss: issuer,
        aud: audience,
        iat: now,
        nbf: now - CLOCK_SKEW_SECS,
        exp: now + OPERATOR_SESSION_TTL_SECS,
        scope: REQUIRED_SCOPE,
        roles: ["operator"],
      }),
    ),
  );
  const signature = await signHs256(`${encodedHeader}.${encodedPayload}`, secret);

  return signature ? `${encodedHeader}.${encodedPayload}.${signature}` : null;
}

function parseJsonSegment(segment: string): JwtPayload | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function verifyHs256(input: string, signature: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(input));
  } catch {
    return false;
  }
}

async function signHs256(input: string, secret: string) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
    return bytesToBase64Url(new Uint8Array(signature));
  } catch {
    return null;
  }
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function audienceIncludes(value: unknown, audience: string) {
  return value === audience || (Array.isArray(value) && value.some((entry) => entry === audience));
}

function normalizeClaimList(value: unknown) {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
