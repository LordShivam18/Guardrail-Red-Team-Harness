import { loadLocalEnv } from "./env";

async function main() {
  loadLocalEnv();

  const { assertRequiredTablesExist } = await import("../lib/db");

  await assertRequiredTablesExist();
}

main().catch((error) => {
  console.error("Database schema check failed.");
  console.error(error);
  process.exitCode = 1;
});
