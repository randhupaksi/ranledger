import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { ServerDatabase } from "./database";
import { digest, token } from "./auth";
export const chunkSize = 500_000;
export const chunkSchema = z
  .object({
    id: z.string().uuid(),
    index: z.number().int().min(0).max(511),
    count: z.number().int().min(1).max(512),
    target: z.string().regex(/^\/spaces\/[a-zA-Z0-9_-]+\/sync$/),
    data: z.string().max(chunkSize),
  })
  .strict();
export async function readSyncBody(
  c: Context,
  db: ServerDatabase,
  userId: string,
): Promise<unknown> {
  const id = c.req.header("x-ranledger-upload");
  if (!id) return c.req.json();
  z.string().uuid().parse(id);
  const rows = (
    await db.query<{
      part: number;
      parts: number;
      target: string;
      data: string;
    }>(
      "SELECT part,parts,target,data FROM rl_uploads WHERE id=$1 AND user_id=$2 AND expires_at>now() ORDER BY part",
      [id, userId],
    )
  ).rows;
  if (
    !rows.length ||
    rows.length !== rows[0].parts ||
    rows.some(
      (row, index) =>
        row.part !== index ||
        row.parts !== rows.length ||
        "/api" + row.target !== c.req.path,
    )
  )
    throw new HTTPException(422, {
      message: "Unggahan sinkronisasi belum lengkap.",
    });
  const text = rows.map((row) => row.data).join("");
  if (text.length > 128 * 1024 * 1024)
    throw new HTTPException(413, { message: "Data terlalu besar." });
  return JSON.parse(text);
}
export async function wrapLargeResponse(
  c: Context,
  db: ServerDatabase,
  userId: string,
) {
  if (
    c.req.path.startsWith("/api/transport/") ||
    !c.res.headers.get("content-type")?.includes("application/json")
  )
    return;
  const text = await c.res.clone().text();
  if (text.length <= chunkSize * 2) return;
  const id = token();
  await db.query(
    "INSERT INTO rl_downloads(id,user_id,data,expires_at) VALUES($1,$2,$3,$4)",
    [digest(id), userId, text, new Date(Date.now() + 10 * 60 * 1000)],
  );
  const headers = new Headers(c.res.headers);
  headers.delete("content-length");
  c.res = new Response(
    JSON.stringify({
      transport: { id, parts: Math.ceil(text.length / chunkSize) },
    }),
    { status: c.res.status, headers },
  );
}
