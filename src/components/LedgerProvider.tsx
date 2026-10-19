import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CircleAlert, X } from "lucide-react";
import { db } from "../data/database";
import type { Ledger } from "../domain/ledger";
import { errorMessage } from "../domain/ledger";
import { Logo } from "./ui";

type Notify = (message: string, error?: boolean) => void;
const LedgerContext = createContext<Ledger | null>(null);
const NotifyContext = createContext<Notify | null>(null);
export function useLedger() {
  const ledger = useContext(LedgerContext);
  if (!ledger) throw new Error("LedgerProvider tidak tersedia.");
  return ledger;
}
export function useNotify() {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error("LedgerProvider tidak tersedia.");
  return notify;
}
export function useCanEdit() {
  const access = useLiveQuery(() => db.syncState.get("access"));
  return access?.value !== "viewer" && access?.value !== "revoked";
}
export function LedgerProvider({ children }: { children: ReactNode }) {
  // Each table keeps its array identity when another table changes.
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const wallets = useLiveQuery(() =>
    db.wallets
      .toArray()
      .then((rows) =>
        rows.sort((a, b) =>
          a.id === "main-wallet"
            ? -1
            : b.id === "main-wallet"
              ? 1
              : a.name.localeCompare(b.name, "id-ID"),
        ),
      ),
  );
  const transfers = useLiveQuery(() => db.transfers.toArray());
  const budgets = useLiveQuery(() => db.budgets.toArray());
  const schedules = useLiveQuery(() => db.schedules.toArray());
  const goals = useLiveQuery(() => db.goals.toArray());
  const liabilities = useLiveQuery(() => db.liabilities.toArray());
  const importBatches = useLiveQuery(() => db.importBatches.toArray());
  const rules = useLiveQuery(() => db.rules.toArray());
  const meta = useLiveQuery(() => db.meta.get("main"));
  const ledger = useMemo<Ledger | undefined>(
    () =>
      transactions &&
      categories &&
      wallets &&
      transfers &&
      budgets &&
      schedules &&
      goals &&
      liabilities &&
      importBatches &&
      rules &&
      meta
        ? {
            transactions,
            categories,
            wallets,
            transfers,
            budgets,
            schedules,
            goals,
            liabilities,
            importBatches,
            rules,
            preferences: meta.preferences,
            revision: meta.revision,
          }
        : undefined,
    [
      transactions,
      categories,
      wallets,
      transfers,
      budgets,
      schedules,
      goals,
      liabilities,
      importBatches,
      rules,
      meta,
    ],
  );
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
    id: number;
  } | null>(null);
  const notify = useCallback<Notify>(
    (message, error = false) => setToast({ message, error, id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 9000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      document.documentElement.dataset.theme =
        ledger?.preferences.theme === "system"
          ? query.matches
            ? "dark"
            : "light"
          : (ledger?.preferences.theme ?? (query.matches ? "dark" : "light"));
    }
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [ledger?.preferences.theme]);
  if (!ledger)
    return (
      <div className="boot-screen">
        <Logo />
        <p>Membuka catatan di perangkat ini…</p>
      </div>
    );
  return (
    <LedgerContext.Provider value={ledger}>
      <NotifyContext.Provider value={notify}>
        {children}
        {toast && (
          <div
            className={`toast ${toast.error ? "toast-error" : ""}`}
            role={toast.error ? "alert" : "status"}
            key={toast.id}
          >
            {toast.error ? <CircleAlert size={20} /> : <Check size={20} />}
            <span>{toast.message}</span>
            <button
              className="icon-button"
              aria-label="Tutup pemberitahuan"
              onClick={() => setToast(null)}
            >
              <X size={17} />
            </button>
          </div>
        )}
      </NotifyContext.Provider>
    </LedgerContext.Provider>
  );
}
export function StorageError({ error }: { error: unknown }) {
  return (
    <main className="boot-screen">
      <Logo />
      <div className="error-panel">
        <h1>Catatan belum bisa dibuka</h1>
        <p>{errorMessage(error)}</p>
        <p>
          Data tidak dihapus otomatis. Coba muat ulang atau buka kembali lewat
          browser yang biasa kamu gunakan.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Muat ulang
        </button>
      </div>
    </main>
  );
}
