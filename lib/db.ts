import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { _pgSql: Sql | undefined };

function getClient(): Sql {
  if (!g._pgSql) {
    g._pgSql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 5 });
  }
  return g._pgSql;
}

// Lazy proxy — defers the postgres() call (and URL validation) until first use
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_t, _this, args) {
    return (getClient() as unknown as (...a: unknown[]) => unknown).apply(_this, args);
  },
  get(_t, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
}) as Sql;
