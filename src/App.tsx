import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  CloudOff,
  DatabaseBackup,
  House,
  Plus,
  Settings2,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  LedgerProvider,
  StorageError,
  useLedger,
} from "./components/LedgerProvider";
import { Logo } from "./components/ui";
import Dashboard from "./features/dashboard/Dashboard";
import Transactions from "./features/transactions/Transactions";
const TransactionDialog = lazy(
  () => import("./features/transactions/TransactionDialog"),
);
import type { Transaction } from "./domain/ledger";

const Reports = lazy(() => import("./features/reports/Reports"));
const BackupPage = lazy(() => import("./features/backup/BackupPage"));
const Settings = lazy(() => import("./features/settings/Settings"));

class AppBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <StorageError error={this.state.error} />
    ) : (
      this.props.children
    );
  }
}
const navigation = [
  { to: "/", label: "Beranda", mobile: "Beranda", icon: House },
  {
    to: "/transaksi",
    label: "Transaksi",
    mobile: "Transaksi",
    icon: WalletCards,
  },
  { to: "/laporan", label: "Laporan", mobile: "Laporan", icon: BarChart3 },
  {
    to: "/backup",
    label: "Backup & pemulihan",
    mobile: "Backup",
    icon: DatabaseBackup,
  },
  {
    to: "/pengaturan",
    label: "Pengaturan",
    mobile: "Pengaturan",
    icon: Settings2,
  },
];
function UpdateNotice({ editing }: { editing: boolean }) {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!offlineReady && !needRefresh) return null;
  return (
    <aside className="update-notice" role="status">
      <div>
        <strong>
          {needRefresh
            ? "Pembaruan Ranledger tersedia"
            : "Siap digunakan offline"}
        </strong>
        <p>
          {needRefresh
            ? editing
              ? "Selesaikan formulir sebelum memperbarui aplikasi."
              : "Catatan tersimpan. Muat versi terbaru saat kamu siap."
            : "Kamu bisa membuka dan mencatat tanpa koneksi di browser ini."}
        </p>
      </div>
      {needRefresh && (
        <button
          className="button primary small-button"
          disabled={editing}
          onClick={() => void updateServiceWorker(true)}
        >
          Perbarui
        </button>
      )}
      <button
        className="icon-button"
        aria-label="Tutup pemberitahuan offline"
        onClick={() => {
          setOfflineReady(false);
          setNeedRefresh(false);
        }}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
function Shell() {
  const { ledger } = useLedger();
  const [dialog, setDialog] = useState<Transaction | "new" | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const location = useLocation();
  const active = navigation.find((n) => n.to === location.pathname);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  useEffect(() => {
    document.title = `${active?.label ?? "Halaman tidak ditemukan"} · Ranledger`;
    window.scrollTo({ top: 0 });
  }, [location.pathname, active?.label]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !dialog &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))
        )
      ) {
        e.preventDefault();
        setDialog("new");
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [dialog]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="Ranledger beranda">
          <Logo />
        </Link>
        <div className="workspace-label">KEUANGAN PRIBADI</div>
        <nav aria-label="Navigasi utama" className="desktop-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="sidebar-add" onClick={() => setDialog("new")}>
          <Plus size={17} />
          Catat transaksi<kbd>N</kbd>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-privacy">
            <ShieldCheck size={22} />
            <strong>Catatanmu, milikmu.</strong>
            <p>
              Tersimpan di perangkat ini.
              <br />
              Tanpa akun, tanpa cloud.
            </p>
            <Link to="/backup">
              Jaga dengan backup <ArrowRight size={14} />
            </Link>
          </div>
          <div className="sidebar-footer">
            <span className="local-dot" />
            Penyimpanan lokal<span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Keuangan pribadi</span>
            <ChevronRight size={14} />
            <strong>{active?.label ?? "404"}</strong>
          </div>
          <Link to="/" className="mobile-brand" aria-label="Ranledger beranda">
            <Logo />
          </Link>
          <div className="topbar-right">
            <span className={`connection-state ${online ? "" : "offline"}`}>
              {online ? (
                <>
                  <span />
                  Lokal & privat
                </>
              ) : (
                <>
                  <CloudOff size={15} />
                  Offline
                </>
              )}
            </span>
            <span className="topbar-date">
              {new Date().toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </header>
        {!online && (
          <div className="offline-banner">
            <CloudOff size={16} />
            Kamu sedang offline. Catatan tetap tersimpan di perangkat ini.
          </div>
        )}
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="route-loading" role="status">
                Membuka halaman…
              </div>
            }
          >
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    onAdd={() => setDialog("new")}
                    onEdit={setDialog}
                  />
                }
              />
              <Route
                path="/transaksi"
                element={
                  <Transactions
                    onAdd={() => setDialog("new")}
                    onEdit={setDialog}
                  />
                }
              />
              <Route path="/laporan" element={<Reports />} />
              <Route path="/backup" element={<BackupPage />} />
              <Route path="/pengaturan" element={<Settings />} />
              <Route
                path="*"
                element={
                  <div className="not-found">
                    <p className="eyebrow">404</p>
                    <h1>Halaman tidak ditemukan</h1>
                    <p>
                      Catatanmu tetap ada. Kembali ke beranda untuk melanjutkan.
                    </p>
                    <Link to="/" className="button primary">
                      Kembali ke beranda
                    </Link>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav aria-label="Navigasi mobile" className="mobile-nav">
        {navigation.map(({ to, mobile, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{mobile}</span>
          </NavLink>
        ))}
      </nav>
      {dialog && (
        <Suspense
          fallback={
            <div
              className="modal-backdrop"
              role="status"
              aria-label="Membuka formulir"
            />
          }
        >
          <TransactionDialog
            key={dialog === "new" ? "new" : dialog.id}
            transaction={dialog === "new" ? undefined : dialog}
            onClose={() => setDialog(null)}
          />
        </Suspense>
      )}
      <UpdateNotice editing={Boolean(dialog)} />
      {ledger.transactions.length >= 90_000 && (
        <div className="capacity-notice" role="status">
          Mendekati batas 100.000 transaksi. Buat backup lengkap sebelum
          melanjutkan.
        </div>
      )}
    </div>
  );
}
export default function App() {
  return (
    <AppBoundary>
      <LedgerProvider>
        <Shell />
      </LedgerProvider>
    </AppBoundary>
  );
}
