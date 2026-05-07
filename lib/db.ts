import { neon } from "@neondatabase/serverless";

type SqlClient = ReturnType<typeof neon>;

let sqlClient: SqlClient | undefined;

function getSqlClient() {
  if (sqlClient) {
    return sqlClient;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error("Invalid DATABASE_URL. Set DATABASE_URL to your Neon Postgres URL.");
  }

  sqlClient = neon(databaseUrl);
  return sqlClient;
}

const sqlProxy = ((strings: TemplateStringsArray, ...params: unknown[]) =>
  getSqlClient()(strings, ...params)) as SqlClient;

export const sql = new Proxy(sqlProxy, {
  get(_target, property) {
    const client = getSqlClient();
    const value = Reflect.get(client, property);

    if (typeof value === "function") {
      return value.bind(client);
    }

    return value;
  }
});
