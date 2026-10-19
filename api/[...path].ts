import { getRequestListener } from "@hono/node-server";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createDatabase } from "../server/database";
import { createApp } from "../server/app";
let handler: ReturnType<typeof getRequestListener> | undefined;
let loading: Promise<void> | undefined;
export default async function api(req: IncomingMessage, res: ServerResponse) {
  if (!process.env.DATABASE_URL || !process.env.APP_ORIGIN) {
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error: "Backend belum dikonfigurasi. Mode lokal tetap tersedia.",
      }),
    );
    return;
  }
  loading ??= (async () => {
    const db = await createDatabase({ url: process.env.DATABASE_URL });
    handler = getRequestListener(
      createApp(db, { origin: process.env.APP_ORIGIN!, secure: true }).fetch,
    );
  })();
  try {
    await loading;
    await handler!(req, res);
  } catch {
    loading = undefined;
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        error:
          "Backend belum tersedia. Gunakan mode lokal atau coba lagi nanti.",
      }),
    );
  }
}
