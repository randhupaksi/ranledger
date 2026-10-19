import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { ServerDatabase, SqlClient } from "./database";
import { digest, passwordHash, passwordMatches, token } from "./auth";
import {
  chunkSchema,
  chunkSize,
  readSyncBody,
  wrapLargeResponse,
} from "./transport";
import {
  canonical,
  fromRecords,
  mergeMutation,
  toRecords,
  type Conflict,
  type Mutation,
  type Records,
} from "../src/domain/sync";
import { emptyLedger } from "../src/domain/ledger";
import { entityNames } from "../src/domain/finance";
import {
  idSchema,
  validateLedger,
  transactionSchema,
  categorySchema,
  walletSchema,
  transferSchema,
  budgetSchema,
  scheduleSchema,
  goalSchema,
  liabilitySchema,
  importBatchSchema,
  ruleSchema,
} from "../src/domain/validation";

type User = { id: string; email: string; name: string; sessionId: string };
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(12).max(128),
  device: z.string().trim().min(1).max(80).default("Browser"),
});
const schemas = {
  transactions: transactionSchema,
  categories: categorySchema,
  wallets: walletSchema,
  transfers: transferSchema,
  budgets: budgetSchema,
  schedules: scheduleSchema,
  goals: goalSchema,
  liabilities: liabilitySchema,
  importBatches: importBatchSchema,
  rules: ruleSchema,
};
const syncSchema = z
  .object({
    id: z.string().uuid(),
    cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    changes: z
      .array(
        z
          .object({
            entity: z.enum(entityNames),
            id: idSchema,
            before: z.record(z.string(), z.unknown()).nullable(),
            after: z.record(z.string(), z.unknown()).nullable(),
          })
          .strict(),
      )
      .max(105000),
  })
  .strict();
const fail = (status: 401 | 403 | 404 | 409 | 422 | 429, message: string) => {
  throw new HTTPException(status, { message });
};
async function records(tx: SqlClient, id: string): Promise<Records> {
  const rows = await tx.query<{ key: string; value: Records[string] }>(
    "SELECT key,value FROM rl_records WHERE space_id=$1 AND value IS NOT NULL",
    [id],
  );
  return Object.fromEntries(rows.rows.map((r) => [r.key, r.value]));
}
async function member(
  tx: SqlClient,
  space: string,
  user: string,
  owner = false,
) {
  const role = (
    await tx.query<{ role: string }>(
      "SELECT role FROM rl_members WHERE space_id=$1 AND user_id=$2",
      [space, user],
    )
  ).rows[0]?.role;
  if (!role || (owner && role !== "owner"))
    fail(403, "Kamu tidak memiliki akses ke ruang ini.");
  return role!;
}
async function audit(
  tx: SqlClient,
  space: string,
  actor: string,
  action: string,
) {
  await tx.query(
    "INSERT INTO rl_audit(id,space_id,actor,action) VALUES($1,$2,$3,$4)",
    [crypto.randomUUID(), space, actor, action],
  );
}
async function delta(tx: SqlClient, space: string, cursor: number) {
  const changes = (
    await tx.query(
      "SELECT key,value,version FROM rl_records WHERE space_id=$1 AND version>$2 ORDER BY version,key",
      [space, cursor],
    )
  ).rows;
  const row = (
    await tx.query("SELECT revision,name FROM rl_spaces WHERE id=$1", [space])
  ).rows[0];
  return { changes, revision: Number(row.revision), name: row.name };
}

export function createApp(
  db: ServerDatabase,
  options: { origin: string; secure?: boolean },
) {
  const app = new Hono<{ Variables: { user: User } }>().basePath("/api");
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (c.req.header("origin") !== options.origin)
        fail(403, "Origin permintaan tidak diizinkan.");
      if (!c.req.header("content-type")?.startsWith("application/json"))
        fail(422, "Gunakan JSON untuk permintaan ini.");
    }
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 128 * 1024 * 1024,
      onError: (c) =>
        c.json({ error: "Data sinkronisasi terlalu besar." }, 413),
    }),
  );
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return c.json(
        { error: "Isian tidak valid. Periksa data yang dikirim." },
        422,
      );
    return c.json(
      {
        error:
          "Layanan belum dapat memproses permintaan. Data lokal tetap tersedia.",
      },
      500,
    );
  });
  app.get("/health", (c) => c.json({ app: "ranledger", version: "3.0.0" }));
  async function rate(scope: string, subject: string, limit: number) {
    const now = Date.now(),
      key = digest(scope + ":" + subject);
    const row = (
      await db.query<{ hits: number }>(
        "INSERT INTO rl_rates(key,hits,reset_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rl_rates.reset_at<$3 THEN 1 ELSE rl_rates.hits+1 END,reset_at=CASE WHEN rl_rates.reset_at<$3 THEN $2 ELSE rl_rates.reset_at END RETURNING hits",
        [key, now + 15 * 60 * 1000, now],
      )
    ).rows[0];
    if (row.hits > limit)
      fail(429, "Terlalu banyak percobaan. Tunggu 15 menit.");
  }
  app.use("/auth/*", async (c, next) => {
    if (
      ["/api/auth/login", "/api/auth/register", "/api/auth/recover"].includes(
        c.req.path,
      )
    ) {
      const ip =
        process.env.TRUST_PROXY === "1"
          ? (c.req.header("x-forwarded-for")?.split(",")[0] ?? "unknown")
          : "same-origin";
      await rate("auth", ip, 60);
    }
    await next();
  });
  async function session(
    c: Context,
    userId: string,
    label: string,
    expectedHash: string,
  ) {
    const raw = token(),
      id = digest(raw);
    await db.transaction(async (tx) => {
      const row = (
        await tx.query<{ password_hash: string }>(
          "SELECT password_hash FROM rl_users WHERE id=$1 FOR UPDATE",
          [userId],
        )
      ).rows[0];
      if (!row || row.password_hash !== expectedHash)
        fail(401, "Informasi akun berubah. Masuk kembali.");
      await tx.query(
        "INSERT INTO rl_sessions(id,user_id,label,expires_at) VALUES($1,$2,$3,$4)",
        [id, userId, label, new Date(Date.now() + 30 * 86400000)],
      );
    });
    setCookie(c, "rl_session", raw, {
      httpOnly: true,
      secure: options.secure ?? false,
      sameSite: "Strict",
      path: "/api",
      maxAge: 30 * 86400,
    });
  }
  app.post("/auth/register", async (c) => {
    const input = credentials
      .extend({ name: z.string().trim().min(1).max(60) })
      .parse(await c.req.json());
    await rate("email", input.email, 12);
    const recoveryCode = token(),
      id = crypto.randomUUID();
    const hash = await passwordHash(input.password);
    await db.transaction(async (tx) => {
      const existing = await tx.query(
        "SELECT id FROM rl_users WHERE email=$1",
        [input.email],
      );
      if (existing.rows.length)
        fail(409, "Alamat ini sudah terdaftar. Masuk atau pulihkan akses.");
      await tx.query(
        "INSERT INTO rl_users(id,email,name,password_hash,recovery_hash) VALUES($1,$2,$3,$4,$5)",
        [id, input.email, input.name, hash, digest(recoveryCode)],
      );
    });
    await session(c, id, input.device, hash);
    return c.json(
      { user: { id, email: input.email, name: input.name }, recoveryCode },
      201,
    );
  });
  app.post("/auth/login", async (c) => {
    const input = credentials.parse(await c.req.json());
    await rate("email", input.email, 12);
    const user = (
      await db.query<{
        id: string;
        email: string;
        name: string;
        password_hash: string;
      }>("SELECT id,email,name,password_hash FROM rl_users WHERE email=$1", [
        input.email,
      ])
    ).rows[0];
    const dummy = "00112233445566778899aabbccddeeff:" + "00".repeat(64);
    const valid = await passwordMatches(
      input.password,
      user?.password_hash ?? dummy,
    );
    if (!user || !valid) fail(401, "Email atau kata sandi tidak sesuai.");
    await session(c, user.id, input.device, user.password_hash);
    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  });
  app.post("/auth/recover", async (c) => {
    const input = credentials
      .extend({ recoveryCode: z.string().min(20).max(100) })
      .parse(await c.req.json());
    await rate("email", input.email, 8);
    const user = (
      await db.query<{ id: string; recovery_hash: string }>(
        "SELECT id,recovery_hash FROM rl_users WHERE email=$1",
        [input.email],
      )
    ).rows[0];
    if (!user || digest(input.recoveryCode) !== user.recovery_hash)
      fail(401, "Informasi pemulihan tidak sesuai.");
    const recoveryCode = token(),
      hash = await passwordHash(input.password);
    await db.transaction(async (tx) => {
      const updated = await tx.query(
        "UPDATE rl_users SET password_hash=$1,recovery_hash=$2 WHERE id=$3 AND recovery_hash=$4 RETURNING id",
        [hash, digest(recoveryCode), user.id, digest(input.recoveryCode)],
      );
      if (!updated.rows.length) fail(401, "Recovery code sudah digunakan.");
      await tx.query("DELETE FROM rl_sessions WHERE user_id=$1", [user.id]);
    });
    await session(c, user.id, input.device, hash);
    return c.json({ recoveryCode });
  });
  app.use("*", async (c, next) => {
    const raw = getCookie(c, "rl_session");
    if (!raw) fail(401, "Masuk untuk menggunakan ruang tersinkron.");
    const row = (
      await db.query<{
        id: string;
        email: string;
        name: string;
        session_id: string;
      }>(
        "SELECT u.id,u.email,u.name,s.id AS session_id FROM rl_users u JOIN rl_sessions s ON s.user_id=u.id WHERE s.id=$1 AND s.expires_at>now()",
        [digest(raw!)],
      )
    ).rows[0];
    if (!row) fail(401, "Sesi berakhir. Masuk kembali.");
    c.set("user", {
      id: row.id,
      email: row.email,
      name: row.name,
      sessionId: row.session_id,
    });
    await next();
  });
  app.use("*", async (c, next) => {
    await next();
    await wrapLargeResponse(c, db, c.get("user").id);
  });
  app.post("/transport/upload", async (c) => {
    const input = chunkSchema.parse(await c.req.json());
    if (input.index >= input.count) fail(422, "Urutan unggahan tidak valid.");
    const user = c.get("user"),
      space = input.target.split("/")[2];
    if ((await member(db, space, user.id)) === "viewer")
      fail(403, "Ruang ini hanya dapat dibaca.");
    await rate("upload", user.id, 1200);
    await db.query("DELETE FROM rl_uploads WHERE expires_at<now()");
    await db.query("DELETE FROM rl_downloads WHERE expires_at<now()");
    await db.query(
      "INSERT INTO rl_uploads(id,user_id,part,parts,target,data,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id,user_id,part) DO UPDATE SET data=EXCLUDED.data,parts=EXCLUDED.parts,target=EXCLUDED.target,expires_at=EXCLUDED.expires_at",
      [
        input.id,
        user.id,
        input.index,
        input.count,
        input.target,
        input.data,
        new Date(Date.now() + 15 * 60 * 1000),
      ],
    );
    return c.json({ ok: true });
  });
  app.get("/transport/download/:id/:part", async (c) => {
    const part = z.coerce
      .number()
      .int()
      .min(0)
      .max(1024)
      .parse(c.req.param("part"));
    const row = (
      await db.query<{ data: string }>(
        "SELECT substring(data FROM $3::integer FOR $4::integer) AS data FROM rl_downloads WHERE id=$1 AND user_id=$2 AND expires_at>now()",
        [
          digest(c.req.param("id")),
          c.get("user").id,
          part * chunkSize + 1,
          chunkSize,
        ],
      )
    ).rows[0];
    if (!row) fail(404, "Unduhan telah kedaluwarsa.");
    return c.json({ data: row!.data });
  });
  app.get("/auth/me", (c) => {
    const { id, email, name } = c.get("user");
    return c.json({ user: { id, email, name } });
  });
  app.post("/auth/logout", async (c) => {
    await db.query("DELETE FROM rl_sessions WHERE id=$1", [
      c.get("user").sessionId,
    ]);
    deleteCookie(c, "rl_session", { path: "/api" });
    return c.json({ ok: true });
  });
  app.get("/auth/devices", async (c) => {
    const rows = (
      await db.query(
        "SELECT id,label,created_at,expires_at FROM rl_sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC",
        [c.get("user").id],
      )
    ).rows;
    return c.json({
      devices: rows.map((row) => ({
        ...row,
        current: row.id === c.get("user").sessionId,
      })),
    });
  });
  app.delete("/auth/devices/:id", async (c) => {
    await db.query("DELETE FROM rl_sessions WHERE id=$1 AND user_id=$2", [
      c.req.param("id"),
      c.get("user").id,
    ]);
    return c.json({ ok: true });
  });
  app.get("/auth/export", async (c) => {
    const user = c.get("user");
    const spaces = (
      await db.query(
        "SELECT s.id,s.name,m.role FROM rl_spaces s JOIN rl_members m ON m.space_id=s.id WHERE m.user_id=$1",
        [user.id],
      )
    ).rows;
    const data = [];
    for (const space of spaces)
      data.push({
        ...space,
        ledger: fromRecords(await records(db, String(space.id))),
      });
    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      spaces: data,
      exportedAt: new Date().toISOString(),
    });
  });
  app.delete("/auth/account", async (c) => {
    const { password } = z
      .object({ password: z.string().max(128) })
      .parse(await c.req.json());
    const user = c.get("user");
    const row = (
      await db.query<{ password_hash: string }>(
        "SELECT password_hash FROM rl_users WHERE id=$1",
        [user.id],
      )
    ).rows[0];
    if (!row || !(await passwordMatches(password, row.password_hash)))
      fail(401, "Kata sandi tidak sesuai.");
    await db.query("DELETE FROM rl_users WHERE id=$1", [user.id]);
    deleteCookie(c, "rl_session", { path: "/api" });
    return c.json({ ok: true });
  });
  app.get("/spaces", async (c) =>
    c.json({
      spaces: (
        await db.query(
          "SELECT s.id,s.name,m.role,s.revision FROM rl_spaces s JOIN rl_members m ON s.id=m.space_id WHERE m.user_id=$1 ORDER BY s.created_at",
          [c.get("user").id],
        )
      ).rows,
    }),
  );
  app.post("/spaces", async (c) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(60) })
      .parse(await c.req.json());
    const user = c.get("user"),
      id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO rl_spaces(id,name,owner_id) VALUES($1,$2,$3)",
        [id, name, user.id],
      );
      await tx.query(
        "INSERT INTO rl_members(space_id,user_id,role) VALUES($1,$2,'owner')",
        [id, user.id],
      );
      await audit(tx, id, user.name, "Membuat ruang");
    });
    return c.json({ id, name, role: "owner", revision: 0 }, 201);
  });
  app.get("/spaces/:id/sync", async (c) => {
    const id = c.req.param("id"),
      cursor = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(c.req.query("cursor") ?? 0);
    return db.transaction(async (tx) => {
      const role = await member(tx, id, c.get("user").id);
      return c.json({ ...(await delta(tx, id, cursor)), role });
    });
  });
  app.post("/spaces/:id/sync", async (c) => {
    const input = syncSchema.parse(await readSyncBody(c, db, c.get("user").id));
    const user = c.get("user"),
      space = c.req.param("id");
    for (const change of input.changes) {
      for (const value of [change.before, change.after])
        if (value) {
          schemas[change.entity].parse(value);
          if (value.id !== change.id)
            fail(422, "Identitas record tidak konsisten.");
        }
    }
    const result = await db.transaction(async (tx) => {
      const spaceRow = (
        await tx.query(
          "SELECT revision FROM rl_spaces WHERE id=$1 FOR UPDATE",
          [space],
        )
      ).rows[0];
      if (!spaceRow) fail(403, "Ruang tidak tersedia.");
      const role = await member(tx, space, user.id);
      if (input.cursor > Number(spaceRow!.revision))
        fail(
          409,
          "Versi ruang berubah. Buka kembali ruang untuk memeriksa data.",
        );
      if (role === "viewer" && input.changes.length)
        fail(403, "Ruang ini hanya dapat dibaca.");
      if (!input.changes.length)
        return { ...(await delta(tx, space, input.cursor)), role };
      const requestHash = digest(canonical(input));
      const replay = (
        await tx.query(
          "SELECT user_id,request_hash FROM rl_operations WHERE space_id=$1 AND id=$2",
          [space, input.id],
        )
      ).rows[0];
      if (
        replay &&
        (replay.user_id !== user.id || replay.request_hash !== requestHash)
      )
        fail(409, "ID operasi sudah digunakan dengan isi berbeda.");
      if (replay) return { ...(await delta(tx, space, input.cursor)), role };
      const current = await records(tx, space),
        next = { ...current };
      const conflicts: Conflict[] = [];
      const changes = input.changes as Mutation[];
      if (
        new Set(changes.map((change) => `${change.entity}/${change.id}`))
          .size !== changes.length
      )
        fail(422, "Record ganda dalam satu operasi.");
      for (const change of changes) {
        const key = `${change.entity}/${change.id}`,
          remote = current[key] ?? null;
        const merged = mergeMutation(change, remote);
        if (merged.conflict) conflicts.push({ ...change, remote });
        else if (merged.value) next[key] = merged.value;
        else delete next[key];
      }
      if (conflicts.length)
        return {
          conflicts,
          records: current,
          role,
          revision: Number(spaceRow!.revision),
        };
      try {
        validateLedger(fromRecords(next));
      } catch {
        fail(
          422,
          "Perubahan melanggar aturan ledger. Muat ulang dan periksa referensi serta saldo.",
        );
      }
      const version = Number(spaceRow!.revision) + 1;
      const updated = changes
        .map((change) => `${change.entity}/${change.id}`)
        .filter(
          (key) =>
            canonical(current[key] ?? null) !== canonical(next[key] ?? null),
        )
        .map((key) => ({ key, value: next[key] ?? null }));
      for (let offset = 0; offset < updated.length; offset += 500)
        await tx.query(
          "INSERT INTO rl_records(space_id,key,value,version) SELECT $1,x.key,x.value,$3 FROM jsonb_to_recordset($2::jsonb) AS x(key text,value jsonb) ON CONFLICT(space_id,key) DO UPDATE SET value=EXCLUDED.value,version=EXCLUDED.version",
          [space, JSON.stringify(updated.slice(offset, offset + 500)), version],
        );
      await tx.query("UPDATE rl_spaces SET revision=$1 WHERE id=$2", [
        version,
        space,
      ]);
      await tx.query(
        "INSERT INTO rl_operations(space_id,id,user_id,request_hash) VALUES($1,$2,$3,$4)",
        [space, input.id, user.id, requestHash],
      );
      if (changes.length)
        await audit(
          tx,
          space,
          user.name,
          `Menyinkronkan ${changes.length} perubahan`,
        );
      return { ...(await delta(tx, space, input.cursor)), role };
    });
    return "conflicts" in result ? c.json(result, 409) : c.json(result);
  });
  app.get("/spaces/:id/members", async (c) => {
    const id = c.req.param("id");
    await member(db, id, c.get("user").id);
    return c.json({
      members: (
        await db.query(
          "SELECT u.id,u.name,u.email,m.role FROM rl_members m JOIN rl_users u ON u.id=m.user_id WHERE m.space_id=$1",
          [id],
        )
      ).rows,
    });
  });
  app.post("/spaces/:id/invites", async (c) => {
    const id = c.req.param("id"),
      { role } = z
        .object({ role: z.enum(["editor", "viewer"]) })
        .parse(await c.req.json());
    const code = token();
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM rl_spaces WHERE id=$1 FOR UPDATE", [id]);
      await member(tx, id, c.get("user").id, true);
      await tx.query(
        "INSERT INTO rl_invites(id,space_id,role,expires_at) VALUES($1,$2,$3,$4)",
        [digest(code), id, role, new Date(Date.now() + 86400000)],
      );
      await audit(
        tx,
        id,
        c.get("user").name,
        "Membuat undangan satu kali (berlaku 24 jam)",
      );
    });
    return c.json({ code, expiresIn: 86400 }, 201);
  });
  app.post("/spaces/join", async (c) => {
    const { code } = z
      .object({ code: z.string().min(20).max(100) })
      .parse(await c.req.json());
    return db.transaction(async (tx) => {
      const invite = (
        await tx.query<{ space_id: string; role: string }>(
          "SELECT space_id,role FROM rl_invites WHERE id=$1 AND expires_at>now() FOR UPDATE",
          [digest(code)],
        )
      ).rows[0];
      if (!invite) fail(404, "Undangan sudah dipakai atau kedaluwarsa.");
      const user = c.get("user");
      await tx.query(
        "INSERT INTO rl_members(space_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(space_id,user_id) DO NOTHING",
        [invite.space_id, user.id, invite.role],
      );
      await tx.query("DELETE FROM rl_invites WHERE id=$1", [digest(code)]);
      await audit(tx, invite.space_id, user.name, "Bergabung ke ruang");
      return c.json({ id: invite.space_id });
    });
  });
  app.patch("/spaces/:id/members/:user", async (c) => {
    const id = c.req.param("id"),
      target = c.req.param("user"),
      { role } = z
        .object({ role: z.enum(["editor", "viewer"]) })
        .parse(await c.req.json());
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM rl_spaces WHERE id=$1 FOR UPDATE", [id]);
      await member(tx, id, c.get("user").id, true);
      await tx.query(
        "UPDATE rl_members SET role=$1 WHERE space_id=$2 AND user_id=$3 AND role<>'owner'",
        [role, id, target],
      );
      await audit(tx, id, c.get("user").name, "Mengubah hak akses anggota");
    });
    return c.json({ ok: true });
  });
  app.delete("/spaces/:id/members/:user", async (c) => {
    const id = c.req.param("id"),
      target = c.req.param("user");
    await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM rl_spaces WHERE id=$1 FOR UPDATE", [id]);
      const user = c.get("user");
      await member(tx, id, user.id, target !== user.id);
      await tx.query(
        "DELETE FROM rl_members WHERE space_id=$1 AND user_id=$2 AND role<>'owner'",
        [id, target],
      );
      await audit(tx, id, user.name, "Mencabut akses anggota");
    });
    return c.json({ ok: true });
  });
  app.get("/spaces/:id/audit", async (c) => {
    await member(db, c.req.param("id"), c.get("user").id);
    return c.json({
      events: (
        await db.query(
          "SELECT id,actor,action,created_at FROM rl_audit WHERE space_id=$1 ORDER BY created_at DESC LIMIT 100",
          [c.req.param("id")],
        )
      ).rows,
    });
  });
  // Seed conversion is exercised by sync and migration tests; keep HTTP errors JSON.
  app.notFound((c) => c.json({ error: "Endpoint tidak ditemukan." }, 404));
  return app;
}
export const initialRecords = () => toRecords(emptyLedger());
