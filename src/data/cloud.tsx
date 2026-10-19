import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, selectLedger } from "./database";
import type { Mutation, Conflict, Records, RecordValue } from "../domain/sync";
import { emptyLedger, type Ledger } from "../domain/ledger";
import { splitText } from "../domain/serialization";
const validateLedger = async (ledger: Ledger) =>
  (await import("../domain/validation")).validateLedger(ledger);
export interface CloudUser {
  id: string;
  name: string;
  email: string;
}
export interface Space {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  revision: number;
}
interface Selection extends Space {
  userId: string;
}
interface Baseline {
  records: Records;
  cursor: number;
}
interface Pending extends Baseline {
  id: string;
  sent: Records;
  changes: Mutation[];
}
interface SyncResponse {
  changes: { key: string; value: RecordValue | null; version: number }[];
  revision: number;
  role: Space["role"];
}
interface ConflictState {
  conflicts: Conflict[];
  records: Records;
  revision: number;
  baseline: Records;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: unknown,
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const text = method === "GET" ? "" : JSON.stringify(body ?? {});
  let uploadId: string | undefined;
  if (text.length > 1_000_000 && method === "POST" && path.endsWith("/sync")) {
    uploadId = crypto.randomUUID();
    const chunks = splitText(text),
      count = chunks.length;
    for (let index = 0; index < count; index++)
      await api("/transport/upload", "POST", {
        id: uploadId,
        index,
        count,
        target: path,
        data: chunks[index],
      });
  }
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    ...(method === "GET"
      ? {}
      : {
          headers: {
            "Content-Type": "application/json",
            ...(uploadId ? { "X-Ranledger-Upload": uploadId } : {}),
          },
          body: uploadId ? "{}" : text,
        }),
    signal: AbortSignal.timeout(45000),
    cache: "no-store",
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Backend belum tersedia. Jalankan API atau lengkapi konfigurasi server.",
    );
  }
  const transport = (result as { transport?: { id: string; parts: number } })
    ?.transport;
  if (transport) {
    if (
      !Number.isInteger(transport.parts) ||
      transport.parts < 1 ||
      transport.parts > 1024
    )
      throw new Error("Unduhan sinkronisasi tidak valid.");
    let text = "";
    for (let part = 0; part < transport.parts; part++)
      text += (
        await api<{ data: string }>(
          `/transport/download/${encodeURIComponent(transport.id)}/${part}`,
        )
      ).data;
    result = JSON.parse(text);
  }
  if (!response.ok)
    throw new ApiError(
      (result as { error?: string }).error ?? "Permintaan belum berhasil.",
      response.status,
      result,
    );
  return result as T;
}
function readSelection(): Selection | null {
  try {
    return JSON.parse(localStorage.getItem("ranledger-cloud-space") ?? "null");
  } catch {
    return null;
  }
}
export function restoreSelection() {
  const selected = readSelection();
  if (selected?.id) selectLedger(selected.id);
}
interface CloudContextValue {
  user: CloudUser | null;
  spaces: Space[];
  active: Selection | null;
  status: string;
  error: string;
  conflicts: ConflictState | null;
  refresh: () => Promise<void>;
  connect: (space: Space, uploadLocal?: boolean) => Promise<void>;
  local: () => void;
  sync: () => Promise<void>;
  logout: () => Promise<void>;
  reloadRemote: () => Promise<void>;
  resolve: (choices: Record<string, "local" | "remote">) => Promise<void>;
}
const CloudContext = createContext<CloudContextValue | null>(null);
export function useCloud() {
  const context = useContext(CloudContext);
  if (!context) throw new Error("CloudProvider tidak tersedia.");
  return context;
}
export function CloudProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CloudUser | null>(null),
    [spaces, setSpaces] = useState<Space[]>([]),
    [active, setActive] = useState<Selection | null>(readSelection),
    [status, setStatus] = useState(
      active
        ? navigator.onLine
          ? "Memeriksa sinkronisasi"
          : "Offline · catatan tersimpan"
        : "Lokal",
    ),
    [error, setError] = useState(""),
    [conflicts, setConflicts] = useState<ConflictState | null>(null);
  const running = useRef(false),
    currentSpace = useRef(active?.id);
  currentSpace.current = active?.id;
  const meta = useLiveQuery(() => db.meta.get("main"), [active?.id]);
  const local = useCallback(() => {
    currentSpace.current = undefined;
    localStorage.removeItem("ranledger-cloud-space");
    setActive(null);
    setConflicts(null);
    setStatus("Lokal");
    setError("");
    selectLedger(null);
  }, []);
  const refresh = useCallback(async () => {
    const result = await api<{ user: CloudUser }>("/auth/me");
    if (active && active.userId !== result.user.id) local();
    setUser(result.user);
    setSpaces((await api<{ spaces: Space[] }>("/spaces")).spaces);
  }, [active, local]);
  useEffect(() => {
    if (!active) return;
    void refresh().catch((e) => {
      setStatus("Masuk kembali");
      setError(e.message);
    });
  }, []); // A local ledger makes no account request.
  const sync = useCallback(async () => {
    if (!active || !user || running.current || conflicts) return;
    if (!navigator.onLine) {
      setStatus("Offline · menunggu koneksi");
      return;
    }
    const spaceId = active.id,
      database = db;
    running.current = true;
    setStatus("Menyinkronkan");
    setError("");
    const work = async () => {
      const { canonical, fromRecords, mergeMutation, mutations, toRecords } =
        await import("../domain/sync");
      if (currentSpace.current !== spaceId) return;
      const saved = await database.syncState.get("baseline");
      const baseline = (saved?.value as Baseline | undefined) ?? {
        records: {},
        cursor: 0,
      };
      const snapshot = await database.snapshot();
      let pending = (await database.syncState.get("pending"))?.value as
        Pending | undefined;
      if (!pending) {
        const sent = toRecords(snapshot);
        pending = {
          ...baseline,
          id: crypto.randomUUID(),
          sent,
          changes: mutations(baseline.records, sent),
        };
        await database.syncState.put({ id: "pending", value: pending });
      }
      const response = await api<SyncResponse>(
        `/spaces/${spaceId}/sync`,
        "POST",
        { id: pending.id, cursor: pending.cursor, changes: pending.changes },
      );
      if (currentSpace.current !== spaceId) return;
      const remote = { ...pending.records };
      for (const row of response.changes) {
        if (row.value) remote[row.key] = row.value;
        else delete remote[row.key];
      }
      const current = await database.snapshot(),
        next = { ...remote };
      const later = mutations(pending.sent, toRecords(current));
      const lateConflicts: Conflict[] = [];
      for (const change of later) {
        const key = `${change.entity}/${change.id}`,
          merged = mergeMutation(change, remote[key] ?? null);
        if (merged.conflict) {
          lateConflicts.push({ ...change, remote: remote[key] ?? null });
          if (change.after) next[key] = change.after;
          else delete next[key];
        } else if (merged.value) next[key] = merged.value;
        else delete next[key];
      }
      const ledger = {
        ...fromRecords(next),
        preferences: current.preferences,
        revision: current.revision,
      };
      await validateLedger(ledger);
      if (canonical(toRecords(current)) !== canonical(next))
        await database.applyRemote(ledger, {
          id: "baseline",
          value: { records: remote, cursor: response.revision },
        });
      else
        await database.syncState.put({
          id: "baseline",
          value: { records: remote, cursor: response.revision },
        });
      await database.syncState.put({ id: "access", value: response.role });
      if (active.role !== response.role) {
        const selection = { ...active, role: response.role };
        localStorage.setItem(
          "ranledger-cloud-space",
          JSON.stringify(selection),
        );
        setActive(selection);
      }
      await database.syncState.delete("pending");
      await database.syncState.put({
        id: "lastSync",
        value: new Date().toISOString(),
      });
      if (lateConflicts.length) {
        const state = {
          conflicts: lateConflicts,
          records: remote,
          revision: response.revision,
          baseline: pending.sent,
        };
        await database.syncState.put({ id: "conflicts", value: state });
        setConflicts(state);
        setStatus("Perlu penyelesaian konflik");
      } else setStatus("Tersinkron");
    };
    try {
      if (navigator.locks)
        await navigator.locks.request(`ranledger-sync-${spaceId}`, work);
      else await work();
    } catch (e) {
      if (currentSpace.current !== spaceId) return;
      const err = e as ApiError;
      setError(err.message);
      if (err.status === 409 && (err.details as ConflictState)?.conflicts) {
        const detail = err.details as ConflictState;
        const saved = await db.syncState.get("baseline");
        const state = {
          ...detail,
          baseline: (saved?.value as Baseline)?.records ?? {},
        };
        await db.syncState.put({ id: "conflicts", value: state });
        setConflicts(state);
        setStatus("Perlu penyelesaian konflik");
      } else if (err.status === 403) {
        if (err.message.includes("hanya dapat dibaca")) {
          await db.syncState.put({ id: "access", value: "viewer" });
          setStatus("Hak baca · perubahan lokal belum dikirim");
        } else {
          await db.syncState.put({ id: "access", value: "revoked" });
          local();
          setError("Akses ruang telah dicabut. Ledger lokal dibuka kembali.");
        }
      } else
        setStatus(
          err.status === 401 ? "Masuk kembali" : "Sinkronisasi tertunda",
        );
    } finally {
      running.current = false;
    }
  }, [active, user, conflicts, local]);
  useEffect(() => {
    if (!active || !user) return;
    const timer = setTimeout(() => void sync(), 1000);
    return () => clearTimeout(timer);
  }, [meta?.revision, active, user, sync]);
  useEffect(() => {
    if (!active) return;
    const connect = () => void sync();
    window.addEventListener("online", connect);
    const timer = setInterval(connect, 15000);
    return () => {
      window.removeEventListener("online", connect);
      clearInterval(timer);
    };
  }, [active, sync]);
  useEffect(() => {
    void db.syncState
      .get("conflicts")
      .then((row) => setConflicts((row?.value as ConflictState) ?? null));
  }, [active?.id]);
  const connect = async (space: Space, uploadLocal = false) => {
    const { fromRecords } = await import("../domain/sync");
    if (!user) throw new Error("Masuk terlebih dahulu.");
    if (running.current)
      throw new Error("Tunggu sinkronisasi selesai sebelum berpindah ruang.");
    let source: Ledger | undefined;
    if (uploadLocal) {
      if (active)
        throw new Error("Aktifkan ledger lokal sebelum memindahkannya.");
      source = await db.snapshot();
      const { createBackup, downloadFile } = await import("./backup");
      downloadFile(
        JSON.stringify(createBackup(source), null, 2),
        "ranledger-sebelum-cloud.json",
        "application/json",
      );
    }
    const result = await api<SyncResponse>(`/spaces/${space.id}/sync?cursor=0`);
    const records: Records = {};
    for (const change of result.changes)
      if (change.value) records[change.key] = change.value;
    if (source && Object.keys(records).length)
      throw new Error(
        "Pemindahan ledger lokal hanya ke ruang baru yang masih kosong.",
      );
    const initial =
      source ??
      (Object.keys(records).length ? fromRecords(records) : emptyLedger());
    await validateLedger(initial);
    if (!Object.keys(records).length && space.role === "viewer")
      throw new Error("Ruang ini belum disiapkan pemilik.");
    const selection = { ...space, role: result.role, userId: user.id };
    selectLedger(space.id);
    const cached = await db.syncState.get("baseline");
    if (!cached || source)
      await db.applyRemote(initial, {
        id: "baseline",
        value: { records, cursor: result.revision },
      });
    await db.syncState.put({ id: "access", value: result.role });
    localStorage.setItem("ranledger-cloud-space", JSON.stringify(selection));
    setActive(selection);
    setConflicts(null);
    setStatus("Menyiapkan sinkronisasi");
  };
  const resolve = async (choices: Record<string, "local" | "remote">) => {
    const { fromRecords, mergeMutation, mutations, toRecords } =
      await import("../domain/sync");
    if (!conflicts) return;
    const current = await db.snapshot(),
      next = { ...conflicts.records };
    const all = mutations(conflicts.baseline, toRecords(current));
    for (const change of all) {
      const key = `${change.entity}/${change.id}`;
      const conflict = conflicts.conflicts.find(
        (c) => c.entity === change.entity && c.id === change.id,
      );
      if (conflict && !choices[key])
        throw new Error("Pilih hasil untuk setiap konflik.");
      const merged = conflict
        ? {
            value:
              choices[key] === "local"
                ? change.after
                : (conflicts.records[key] ?? null),
          }
        : mergeMutation(change, conflicts.records[key] ?? null);
      if (merged.value) next[key] = merged.value;
      else delete next[key];
    }
    const ledger = {
      ...fromRecords(next),
      preferences: current.preferences,
      revision: current.revision,
    };
    await validateLedger(ledger);
    await db.applyRemote(ledger, {
      id: "baseline",
      value: { records: conflicts.records, cursor: conflicts.revision },
    });
    await db.syncState.bulkDelete(["pending", "conflicts"]);
    setConflicts(null);
    setStatus("Menunggu sinkronisasi");
  };
  const logout = async () => {
    await api("/auth/logout", "POST");
    local();
    setUser(null);
    setSpaces([]);
  };
  const reloadRemote = async () => {
    if (!active || running.current)
      throw new Error("Tunggu operasi yang berjalan selesai.");
    running.current = true;
    const database = db,
      spaceId = active.id;
    try {
      const response = await api<SyncResponse>(
        `/spaces/${spaceId}/sync?cursor=0`,
      );
      const { fromRecords } = await import("../domain/sync");
      const remote: Records = {};
      for (const change of response.changes)
        if (change.value) remote[change.key] = change.value;
      const ledger = fromRecords(remote);
      await validateLedger(ledger);
      const { createBackup, downloadFile } = await import("./backup");
      downloadFile(
        JSON.stringify(createBackup(await database.snapshot()), null, 2),
        "ranledger-sebelum-muat-ruang.json",
        "application/json",
      );
      if (currentSpace.current !== spaceId) return;
      await database.applyRemote(ledger, {
        id: "baseline",
        value: { records: remote, cursor: response.revision },
      });
      await database.syncState.bulkDelete(["pending", "conflicts"]);
      await database.syncState.put({ id: "access", value: response.role });
      const selection = { ...active, role: response.role };
      localStorage.setItem("ranledger-cloud-space", JSON.stringify(selection));
      setActive(selection);
      setConflicts(null);
      setError("");
      setStatus("Tersinkron");
    } finally {
      running.current = false;
    }
  };
  return (
    <CloudContext.Provider
      value={{
        user,
        spaces,
        active,
        status,
        error,
        conflicts,
        refresh,
        connect,
        local,
        sync,
        logout,
        reloadRemote,
        resolve,
      }}
    >
      {children}
    </CloudContext.Provider>
  );
}
