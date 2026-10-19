import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabase, type ServerDatabase } from "./database";
import { createApp, initialRecords } from "./app";
import { mutations, toRecords, type Records } from "../src/domain/sync";
import { emptyLedger, type Transaction } from "../src/domain/ledger";
import { canonical, splitText } from "../src/domain/serialization";
let database: ServerDatabase, app: ReturnType<typeof createApp>;
const origin = "http://app.test";
const password = "synthetic-test-password-123";
beforeAll(async () => {
  database = await createDatabase({ url: process.env.TEST_DATABASE_URL });
  app = createApp(database, { origin });
}, 30000);
afterAll(async () => {
  await database.close();
});
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
) {
  return app.request("http://app.test/api" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
}
async function register() {
  const email = `user-${crypto.randomUUID()}@example.test`;
  const response = await request("/auth/register", "POST", {
    email,
    password,
    name: "Synthetic user",
  });
  expect(response.status).toBe(201);
  const data = await response.json();
  return {
    email,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    id: data.user.id as string,
    code: data.recoveryCode as string,
  };
}
async function space(cookie: string) {
  const response = await request(
    "/spaces",
    "POST",
    { name: "Synthetic space" },
    cookie,
  );
  expect(response.status).toBe(201);
  return (await response.json()).id as string;
}
const at = "2026-10-01T00:00:00.000Z";
const row: Transaction = {
  id: "test-record",
  kind: "expense",
  amount: 100,
  walletId: "main-wallet",
  categoryId: "food",
  date: "2026-10-01",
  note: "Original",
  createdAt: at,
  updatedAt: at,
};
async function seed(cookie: string, id: string) {
  const ledger = emptyLedger();
  ledger.transactions = [row];
  const records = toRecords(ledger);
  const response = await request(
    `/spaces/${id}/sync`,
    "POST",
    { id: crypto.randomUUID(), cursor: 0, changes: mutations({}, records) },
    cookie,
  );
  expect(response.status).toBe(200);
  return { records, revision: (await response.json()).revision as number };
}
describe("v3 API authorization, transactions and recovery", () => {
  it("denies unauthenticated and cross-origin access", async () => {
    expect((await request("/spaces")).status).toBe(401);
    const response = await app.request("http://app.test/api/auth/register", {
      method: "POST",
      headers: {
        Origin: "http://evil.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(403);
  });
  it("uses HttpOnly sessions and does not disclose recovery code on login", async () => {
    const user = await register();
    const response = await request("/auth/login", "POST", {
      email: user.email,
      password,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect((await response.json()).recoveryCode).toBeUndefined();
    expect(
      (
        await request("/auth/login", "POST", {
          email: user.email,
          password: "not-the-right-password",
        })
      ).status,
    ).toBe(401);
  });
  it("isolates spaces and account exports by membership", async () => {
    const a = await register(),
      b = await register(),
      id = await space(a.cookie);
    await seed(a.cookie, id);
    expect(
      (await request(`/spaces/${id}/sync`, "GET", undefined, b.cookie)).status,
    ).toBe(403);
    expect(
      (await request(`/spaces/${id}/members`, "GET", undefined, b.cookie))
        .status,
    ).toBe(403);
    expect(
      (await (await request("/auth/export", "GET", undefined, b.cookie)).json())
        .spaces,
    ).toEqual([]);
  });
  it("sync retry is idempotent and merges independent fields", async () => {
    const user = await register(),
      id = await space(user.cookie),
      base = await seed(user.cookie, id);
    const changed = {
      ...base.records,
      "transactions/test-record": {
        ...base.records["transactions/test-record"],
        note: "Device A",
      },
    };
    const input = {
      id: crypto.randomUUID(),
      cursor: base.revision,
      changes: mutations(base.records, changed),
    };
    const first = await request(
      `/spaces/${id}/sync`,
      "POST",
      input,
      user.cookie,
    );
    const revision = (await first.json()).revision;
    expect(
      (await request(`/spaces/${id}/sync`, "POST", input, user.cookie)).status,
    ).toBe(200);
    const another = {
      ...base.records,
      "transactions/test-record": {
        ...base.records["transactions/test-record"],
        amount: 200,
      },
    };
    const second = await request(
      `/spaces/${id}/sync`,
      "POST",
      {
        id: crypto.randomUUID(),
        cursor: base.revision,
        changes: mutations(base.records, another),
      },
      user.cookie,
    );
    expect(second.status).toBe(200);
    const result = await second.json();
    expect(result.revision).toBe(revision + 1);
    const record = result.changes.find(
      (c: { key: string }) => c.key === "transactions/test-record",
    ).value;
    expect(record).toMatchObject({ note: "Device A", amount: 200 });
  });
  it("returns explicit conflicts without applying part of a batch", async () => {
    const user = await register(),
      id = await space(user.cookie),
      base = await seed(user.cookie, id);
    for (const note of ["First", "Second"]) {
      const records = {
        ...base.records,
        "transactions/test-record": {
          ...base.records["transactions/test-record"],
          note,
        },
      };
      const response = await request(
        `/spaces/${id}/sync`,
        "POST",
        {
          id: crypto.randomUUID(),
          cursor: base.revision,
          changes: mutations(base.records, records),
        },
        user.cookie,
      );
      if (note === "First") expect(response.status).toBe(200);
      else {
        expect(response.status).toBe(409);
        const conflict = await response.json();
        expect(conflict.conflicts[0].remote.note).toBe("First");
        expect(conflict.revision).toBe(base.revision + 1);
      }
    }
  });
  it("rejects invalid references atomically", async () => {
    const user = await register(),
      id = await space(user.cookie),
      base = await seed(user.cookie, id);
    const next: Records = { ...base.records };
    delete next["wallets/main-wallet"];
    const response = await request(
      `/spaces/${id}/sync`,
      "POST",
      {
        id: crypto.randomUUID(),
        cursor: base.revision,
        changes: mutations(base.records, next),
      },
      user.cookie,
    );
    expect(response.status).toBe(422);
    const actual = await (
      await request(
        `/spaces/${id}/sync?cursor=0`,
        "GET",
        undefined,
        user.cookie,
      )
    ).json();
    expect(actual.revision).toBe(base.revision);
    expect(
      actual.changes.some(
        (c: { key: string; value: unknown }) =>
          c.key === "wallets/main-wallet" && c.value,
      ),
    ).toBe(true);
  });
  it("invites are one-time and reader roles are enforced on server", async () => {
    const owner = await register(),
      reader = await register(),
      stranger = await register(),
      id = await space(owner.cookie);
    const base = await seed(owner.cookie, id);
    const invite = await (
      await request(
        `/spaces/${id}/invites`,
        "POST",
        { role: "viewer" },
        owner.cookie,
      )
    ).json();
    expect(
      (
        await request(
          "/spaces/join",
          "POST",
          { code: invite.code },
          reader.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/spaces/join",
          "POST",
          { code: invite.code },
          stranger.cookie,
        )
      ).status,
    ).toBe(404);
    const after = {
      ...base.records,
      "transactions/test-record": {
        ...base.records["transactions/test-record"],
        note: "Forbidden",
      },
    };
    expect(
      (
        await request(
          `/spaces/${id}/sync`,
          "POST",
          {
            id: crypto.randomUUID(),
            cursor: base.revision,
            changes: mutations(base.records, after),
          },
          reader.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/spaces/${id}/invites`,
          "POST",
          { role: "editor" },
          reader.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/spaces/${id}/members/${reader.id}`,
          "PATCH",
          { role: "editor" },
          owner.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/spaces/${id}/sync`,
          "POST",
          {
            id: crypto.randomUUID(),
            cursor: base.revision,
            changes: mutations(base.records, after),
          },
          reader.cookie,
        )
      ).status,
    ).toBe(200);
    await request(
      `/spaces/${id}/members/${reader.id}`,
      "DELETE",
      {},
      owner.cookie,
    );
    expect(
      (await request(`/spaces/${id}/sync`, "GET", undefined, reader.cookie))
        .status,
    ).toBe(403);
  });
  it("recovery rotates code and revokes every old session", async () => {
    const user = await register();
    const response = await request("/auth/recover", "POST", {
      email: user.email,
      password: "synthetic-new-password-456",
      recoveryCode: user.code,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.recoveryCode).not.toBe(user.code);
    expect(
      (await request("/auth/me", "GET", undefined, user.cookie)).status,
    ).toBe(401);
    expect(
      (
        await request("/auth/recover", "POST", {
          email: user.email,
          password,
          recoveryCode: user.code,
        })
      ).status,
    ).toBe(401);
  });
  it("session revocation and account deletion remove server access", async () => {
    const user = await register(),
      id = await space(user.cookie);
    await seed(user.cookie, id);
    const sessions = await (
      await request("/auth/devices", "GET", undefined, user.cookie)
    ).json();
    expect(sessions.devices[0].current).toBe(true);
    const extra = await request("/auth/login", "POST", {
      email: user.email,
      password,
    });
    const other = extra.headers.get("set-cookie")!.split(";")[0];
    await request(
      `/auth/devices/${sessions.devices[0].id}`,
      "DELETE",
      {},
      other,
    );
    expect(
      (await request("/auth/me", "GET", undefined, user.cookie)).status,
    ).toBe(401);
    expect(
      (await request("/auth/account", "DELETE", { password: "wrong" }, other))
        .status,
    ).toBe(401);
    expect(
      (await request("/auth/account", "DELETE", { password }, other)).status,
    ).toBe(200);
    expect(
      (await database.query("SELECT id FROM rl_spaces WHERE id=$1", [id])).rows,
    ).toHaveLength(0);
    expect((await request("/auth/me", "GET", undefined, other)).status).toBe(
      401,
    );
  });
  it("initial records contain only the user's empty ledger", () => {
    expect(Object.keys(initialRecords())).toHaveLength(12);
  });
  it("transports a large Unicode ledger in authenticated chunks", async () => {
    const user = await register(),
      id = await space(user.cookie),
      ledger = emptyLedger();
    ledger.transactions = Array.from({ length: 2500 }, (_, i) => ({
      ...row,
      id: `large-${i}`,
      note: "🟢".repeat(180),
    }));
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      cursor: 0,
      changes: mutations({}, toRecords(ledger)),
    });
    const upload = crypto.randomUUID(),
      chunks = splitText(payload),
      count = chunks.length;
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index++)
      expect(
        (
          await request(
            "/transport/upload",
            "POST",
            {
              id: upload,
              index,
              count,
              target: `/spaces/${id}/sync`,
              data: chunks[index],
            },
            user.cookie,
          )
        ).status,
      ).toBe(200);
    const response = await app.request(
      `http://app.test/api/spaces/${id}/sync`,
      {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: user.cookie,
          "Content-Type": "application/json",
          "X-Ranledger-Upload": upload,
        },
        body: "{}",
      },
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.transport.parts).toBeGreaterThan(1);
    let text = "";
    for (let part = 0; part < result.transport.parts; part++) {
      const response = await request(
        `/transport/download/${result.transport.id}/${part}`,
        "GET",
        undefined,
        user.cookie,
      );
      const body = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(200);
      text += body.data;
    }
    const data = JSON.parse(text);
    expect(
      canonical(
        Object.fromEntries(
          data.changes.map((change: { key: string; value: unknown }) => [
            change.key,
            change.value,
          ]),
        ),
      ),
    ).toBe(canonical(toRecords(ledger)));
    expect(
      data.changes.filter((change: { key: string }) =>
        change.key.startsWith("transactions/"),
      ).length,
    ).toBe(2500);
    expect(
      data.changes.find(
        (change: { key: string }) => change.key === "transactions/large-0",
      ).value.note,
    ).toBe("🟢".repeat(180));
    const other = await register();
    expect(
      (
        await request(
          `/transport/download/${result.transport.id}/0`,
          "GET",
          undefined,
          other.cookie,
        )
      ).status,
    ).toBe(404);
  });
});
