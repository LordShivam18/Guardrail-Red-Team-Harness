import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "./env";

async function main() {
  loadLocalEnv();

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  const sql = neon(databaseUrl);

  await sql`
    create table if not exists mesh_dataset_versions (
      id serial primary key,
      version varchar(20) not null,
      payload_count integer not null,
      export_hash varchar(64) not null,
      exported_at timestamptz default now(),
      changelog text
    )
  `;

  console.log("[migrate:003] mesh_dataset_versions table is ready.");
}

main().catch((error) => {
  console.error("[migrate:003] Migration failed.");
  console.error(error);
  process.exitCode = 1;
});
