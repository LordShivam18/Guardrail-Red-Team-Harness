import "server-only";
import { cookies } from "next/headers";
import { verifyOperatorToken, type OperatorIdentity } from "@/lib/auth-token";

const SESSION_COOKIE = "mesh_session";

export class OperatorSessionError extends Error {
  constructor() {
    super("An authenticated operator session is required.");
    this.name = "OperatorSessionError";
  }
}

export async function requireOperatorSession(): Promise<OperatorIdentity> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const identity = token ? await verifyOperatorToken(token) : null;
  if (!identity) throw new OperatorSessionError();
  return identity;
}
