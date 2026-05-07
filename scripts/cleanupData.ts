import { loadLocalEnv } from "./env";

type DeletedCountRow = {
  deleted_count: number;
};

async function main() {
  loadLocalEnv();

  const { sql } = await import("../lib/db");

  const resultRows = (await sql`
    with deleted as (
      delete from redteam_results
      where created_at < now() - interval '30 days'
      returning id
    )
    select count(*)::int as deleted_count
    from deleted
  `) as DeletedCountRow[];

  const runRows = (await sql`
    with deleted as (
      delete from redteam_runs
      where created_at < now() - interval '30 days'
      returning id
    )
    select count(*)::int as deleted_count
    from deleted
  `) as DeletedCountRow[];

  console.log(
    `Deleted ${resultRows[0]?.deleted_count ?? 0} red-team results older than 30 days.`
  );
  console.log(
    `Deleted ${runRows[0]?.deleted_count ?? 0} red-team runs older than 30 days.`
  );
}

main().catch((error) => {
  console.error("Failed to clean up old red-team data.");
  console.error(error);
  process.exitCode = 1;
});
