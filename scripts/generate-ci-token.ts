import { createOperatorSessionToken } from "../lib/auth-token";

async function main() {
  const token = await createOperatorSessionToken("ci-security-gate-operator");

  if (!token) {
    console.error("ERROR: Failed to generate operator session token.");
    console.error("Ensure MESH_AUTH_TOKEN_SECRET (>= 32 chars), MESH_AUTH_ISSUER, and MESH_AUTH_AUDIENCE are set.");
    process.exit(1);
  }

  // Print token in GITHUB_ENV format if running in GitHub Actions, or to stdout
  if (process.env.GITHUB_ENV) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.GITHUB_ENV, `MESH_CI_TOKEN=${token}\n`);
    console.log("[CI Token] Successfully appended MESH_CI_TOKEN to GITHUB_ENV.");
  } else {
    console.log(token);
  }
}

main().catch((err) => {
  console.error("Fatal error generating CI token:", err);
  process.exit(1);
});
