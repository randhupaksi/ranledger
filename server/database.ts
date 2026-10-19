import { schema } from "./schema";
export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface ServerDatabase extends SqlClient {
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function createDatabase(
  options: { url?: string; directory?: string } = {},
): Promise<ServerDatabase> {
  if (options.url) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: options.url,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    const setup = await pool.connect();
    try {
      await setup.query("SELECT pg_advisory_lock(72613003)");
      await setup.query(schema);
    } finally {
      await setup.query("SELECT pg_advisory_unlock(72613003)");
      setup.release();
    }
    return {
      query: async (sql, values) => pool.query(sql, values),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(client);
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("DATABASE_URL wajib untuk backend produksi.");
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(options.directory ?? "memory://");
  await pg.exec(schema);
  return {
    query: (sql, values) => pg.query(sql, values),
    transaction: (fn) =>
      pg.transaction((tx) =>
        fn({ query: (sql, values) => tx.query(sql, values) }),
      ),
    close: () => pg.close(),
  };
}
