import { serve } from "@hono/node-server";
import { createDatabase } from "./database";
import { createApp } from "./app";
try {
  process.loadEnvFile();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const db = await createDatabase({
  url: process.env.DATABASE_URL,
  directory: process.env.PGLITE_DIR ?? ".cache/server-data",
});
const origin = process.env.APP_ORIGIN ?? "http://localhost:5173";
const app = createApp(db, {
  origin,
  secure: process.env.NODE_ENV === "production",
});
const server = serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 8787),
    hostname: process.env.HOST ?? "127.0.0.1",
  },
  (info) => {
    process.stdout.write(`Ranledger API listening on ${info.port}\n`);
  },
);
async function close() {
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
