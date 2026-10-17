import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CircleAlert, X } from "lucide-react";
import { db } from "../data/database";
import type { Ledger } from "../domain/ledger";
import { errorMessage } from "../domain/ledger";
import { Logo } from "./ui";

interface LedgerContextValue {
  ledger: Ledger;
  notify: (message: string, error?: boolean) => void;
}
const LedgerContext = createContext<LedgerContextValue | null>(null);
export function useLedger() {
  const context = useContext(LedgerContext);
  if (!context) throw new Error("LedgerProvider tidak tersedia.");
  return context;
}
export function LedgerProvider({ children }: { children: ReactNode }) {
  const ledger = useLiveQuery(() => db.snapshot());
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
    id: number;
  } | null>(null);
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
    <LedgerContext.Provider
      value={{
        ledger,
        notify: (message, error = false) =>
          setToast({ message, error, id: Date.now() }),
      }}
    >
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
