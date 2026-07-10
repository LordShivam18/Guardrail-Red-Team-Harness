import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const normalizedSecret = secret.trim();
  const normalizedSignature = normalizeSignature(signature);

  if (!payload || !normalizedSecret || !normalizedSignature) {
    return false;
  }

  const expectedSignature = createHmac("sha256", normalizedSecret)
    .update(payload, "utf8")
    .digest("hex");
  const received = Buffer.from(normalizedSignature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

function normalizeSignature(signature: string) {
  const trimmed = signature.trim();
  const withoutPrefix = trimmed.startsWith("sha256=") ? trimmed.slice(7) : trimmed;

  return /^[a-f0-9]{64}$/i.test(withoutPrefix) ? withoutPrefix.toLowerCase() : null;
}
