import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL environment variable.");
}

if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
  throw new Error("Invalid DATABASE_URL. Set DATABASE_URL to your Neon Postgres URL.");
}

export const sql = neon(databaseUrl);
