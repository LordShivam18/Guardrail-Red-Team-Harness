"use server";

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createOperatorSessionToken, OPERATOR_SESSION_TTL_SECS } from "@/lib/auth-token";

const SESSION_COOKIE = "mesh_session";

const passwordMatches = (candidate: string, expected: string) => {
  const candidateHash = createHash("sha256").update(candidate, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateHash, expectedHash);
};

/** Validates the local operator passphrase and starts a signed browser session. */
export async function loginOperator(formData: FormData) {
  const submittedPassphrase = formData.get("passphrase");
  const configuredPassphrase = process.env.ADMIN_PASSPHRASE;

  if (
    typeof submittedPassphrase !== "string" ||
    !configuredPassphrase ||
    !passwordMatches(submittedPassphrase, configuredPassphrase)
  ) {
    redirect("/login?error=invalid");
  }

  const token = await createOperatorSessionToken();
  if (!token) {
    redirect("/login?error=configuration");
  }

  cookies().set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OPERATOR_SESSION_TTL_SECS,
  });

  redirect("/dashboard");
}
