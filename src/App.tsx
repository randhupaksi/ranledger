import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  BarChart3,
  ArrowRight,
  CloudOff,
  DatabaseBackup,
  House,
  Plus,
  Settings2,
  WalletCards,
  X,
  Wallet,
  CalendarClock,
  PieChart,
  FileUp,
  FileQuestion,
  MoreHorizontal,
  Users,
  Landmark,
  CalendarDays,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  LedgerProvider,
  StorageError,
  useLedger,
  useCanEdit,
} from "./components/LedgerProvider";
import { Logo } from "./components/ui";
import Dashboard from "./features/dashboard/Dashboard";
import { CloudProvider, useCloud } from "./data/cloud";
const CloudPage = lazy(() => import("./features/cloud/CloudPage"));
const Liabilities = lazy(() => import("./features/liabilities/Liabilities"));
const Calendar = lazy(() => import("./features/calendar/Calendar"));
const Reconciliation = lazy(
  () => import("./features/reconciliation/Reconciliation"),
);
const Transactions = lazy(() => import("./features/transactions/Transactions"));
const TransactionDialog = lazy(
  () => import("./features/transactions/TransactionDialog"),
);
import type { Transaction } from "./domain/ledger";

const Reports = lazy(() => import("./features/reports/Reports"));
const BackupPage = lazy(() => import("./features/backup/BackupPage"));
const Settings = lazy(() => import("./features/settings/Settings"));
const Wallets = lazy(() => import("./features/wallets/Wallets"));
const Budgets = lazy(() => import("./features/budgets/Budgets"));
const Schedules = lazy(() => import("./features/planning/Schedules"));
const Goals = lazy(() => import("./features/planning/Goals"));
const ImportCsv = lazy(() => import("./features/import/ImportCsv"));
const Modal = lazy(() =>
  import("./components/Modal").then((module) => ({ default: module.Modal })),
);

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
  { to: "/dompet", label: "Dompet", mobile: "Dompet", icon: Wallet },
  {
    to: "/kewajiban",
    label: "Tagihan & cicilan",
    mobile: "Kewajiban",
    icon: Landmark,
  },
  { to: "/anggaran", label: "Anggaran", mobile: "Anggaran", icon: PieChart },
  {
    to: "/rencana",
    label: "Jadwal & target",
    mobile: "Rencana",
    icon: CalendarClock,
  },
  {
    to: "/kalender",
    label: "Kalender & proyeksi",
    mobile: "Kalender",
    icon: CalendarDays,
  },
  { to: "/impor", label: "Impor CSV", mobile: "Impor", icon: FileUp },
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
  { to: "/ruang", label: "Ruang & sinkronisasi", mobile: "Ruang", icon: Users },
];
function NotFoundPage() {
  return (
    <main className="not-found-screen">
      <section className="not-found" aria-labelledby="not-found-title">
        <div className="not-found-icon" aria-hidden="true">
          <FileQuestion size={38} strokeWidth={1.5} />
        </div>
        <p className="eyebrow">404 · HALAMAN TIDAK TERSEDIA</p>
        <h1 id="not-found-title">Halaman tidak ditemukan</h1>
        <p className="not-found-description">
          Alamat ini mungkin sudah berubah. Catatan keuanganmu tetap aman.
        </p>
        <Link to="/" className="button primary">
          <House size={16} />
          Kembali ke beranda
        </Link>
      </section>
    </main>
  );
}
function UpdateNotice({ editing }: { editing: boolean }) {
  const [openDialog, setOpenDialog] = useState(false);
  useEffect(() => {
    const inspect = () =>
      setOpenDialog(
        Boolean(
          document.querySelector('[role="dialog"], [data-editing="true"]'),
        ),
      );
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    inspect();
    return () => observer.disconnect();
  }, []);
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
            ? editing || openDialog
              ? "Selesaikan formulir sebelum memperbarui aplikasi."
              : "Catatan tersimpan. Muat versi terbaru saat kamu siap."
            : "Kamu bisa membuka dan mencatat tanpa koneksi di browser ini."}
        </p>
      </div>
      {needRefresh && (
        <button
          className="button primary small-button"
          disabled={editing || openDialog}
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
  const ledger = useLedger();
  const cloud = useCloud(),
    canEdit = useCanEdit();
  const [dialog, setDialog] = useState<Transaction | "new" | null>(null);
  const [more, setMore] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const location = useLocation();
  const active = navigation.find(
    (n) =>
      n.to === location.pathname ||
      (n.to === "/impor" && location.pathname === "/rekonsiliasi") ||
      (n.to === "/rencana" && location.pathname.startsWith("/rencana/")),
  );
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
    const updateTime = () => setNow(new Date());
    const interval = window.setInterval(updateTime, 30_000);
    window.addEventListener("focus", updateTime);
    document.addEventListener("visibilitychange", updateTime);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateTime);
      document.removeEventListener("visibilitychange", updateTime);
    };
  }, []);
  useEffect(() => {
    document.title = `${active?.label ?? "Halaman tidak ditemukan"} · Ranledger`;
    window.scrollTo({ top: 0 });
  }, [location.pathname, active?.label]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (
        active &&
        e.key.toLowerCase() === "n" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !dialog &&
        canEdit &&
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
  }, [dialog, canEdit, active]);
  if (!active) return <NotFoundPage />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="Ranledger beranda">
          <Logo />
        </Link>
        <nav aria-label="Navigasi utama" className="desktop-nav">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive || (to === "/impor" && location.pathname === "/rekonsiliasi") ? "active" : ""}`
              }
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          className="sidebar-add"
          aria-label="Catat transaksi"
          disabled={!canEdit}
          onClick={() => setDialog("new")}
        >
          <Plus size={17} />
          Catat transaksi<kbd>N</kbd>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-footer">
            <span className="sidebar-copyright">
              © 2026 Ranledger · All rights reserved.
            </span>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Keuangan pribadi</span>
            <ArrowRight size={14} aria-hidden="true" />
            <strong>{active?.label ?? "404"}</strong>
          </div>
          <Link to="/" className="mobile-brand" aria-label="Ranledger beranda">
            <Logo />
          </Link>
          <div className="topbar-right">
            <span
              className={`connection-state ${online ? "" : "offline"}`}
              data-connection-mode={
                online ? (cloud.active ? "shared" : "local") : "offline"
              }
            >
              {online ? (
                <>
                  <span />
                  {cloud.active ? cloud.status : "By Randhu"}
                </>
              ) : (
                <>
                  <CloudOff size={15} />
                  Offline
                </>
              )}
            </span>
            <time className="topbar-date" dateTime={now.toISOString()}>
              <CalendarDays size={15} aria-hidden="true" />
              <span>
                {now.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hourCycle: "h23",
                })}
                {", "}
                {now.toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </time>
          </div>
        </header>
        {!online && (
          <div className="offline-banner">
            <CloudOff size={16} />
            Kamu sedang offline. Catatan tetap tersimpan di perangkat ini.
          </div>
        )}
        {!canEdit && (
          <div className="v3-access-banner" role="status">
            Ruang ini hanya dapat dibaca atau aksesnya telah dicabut.{" "}
            <Link to="/ruang">Kelola akses ruang</Link>
          </div>
        )}
        {cloud.conflicts && (
          <div className="v3-access-banner" role="status">
            Ada perubahan yang perlu ditinjau sebelum sinkronisasi dilanjutkan.{" "}
            <Link to="/ruang">Selesaikan konflik</Link>
          </div>
        )}
        <main
          id="main-content"
          className="main-content"
          data-page={location.pathname.split("/")[1] || "beranda"}
          tabIndex={-1}
        >
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
                    onAdd={() => canEdit && setDialog("new")}
                    onEdit={setDialog}
                  />
                }
              />
              <Route
                path="/transaksi"
                element={
                  <Transactions
                    onAdd={() => canEdit && setDialog("new")}
                    onEdit={setDialog}
                  />
                }
              />
              <Route path="/laporan" element={<Reports />} />
              <Route path="/backup" element={<BackupPage />} />
              <Route path="/pengaturan" element={<Settings />} />
              <Route path="/dompet" element={<Wallets />} />
              <Route path="/anggaran" element={<Budgets />} />
              <Route path="/rencana" element={<Schedules />} />
              <Route path="/rencana/tujuan" element={<Goals />} />
              <Route path="/impor" element={<ImportCsv />} />
              <Route path="/ruang" element={<CloudPage />} />
              <Route path="/kewajiban" element={<Liabilities />} />
              <Route path="/kalender" element={<Calendar />} />
              <Route path="/rekonsiliasi" element={<Reconciliation />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav aria-label="Navigasi mobile" className="mobile-nav">
        {navigation
          .filter((n) =>
            ["/", "/transaksi", "/anggaran", "/rencana"].includes(n.to),
          )
          .map(({ to, mobile, icon: Icon }) => (
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
        <button
          onClick={() => setMore(true)}
          aria-expanded={more}
          className={
            active &&
            !["/", "/transaksi", "/anggaran", "/rencana"].includes(active.to)
              ? "active"
              : ""
          }
        >
          <MoreHorizontal size={20} />
          <span>Lainnya</span>
        </button>
      </nav>
      {more && (
        <Suspense fallback={null}>
          <Modal
            open={more}
            onClose={() => setMore(false)}
            title="Ruang keuanganmu"
            description="Buka dompet, laporan, atau kelola catatan di perangkat ini."
          >
            <nav className="more-menu" aria-label="Menu lainnya">
              {navigation
                .filter(
                  (n) =>
                    !["/", "/transaksi", "/anggaran", "/rencana"].includes(
                      n.to,
                    ),
                )
                .map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to} onClick={() => setMore(false)}>
                    <Icon size={19} />
                    <span>{label}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ))}
            </nav>
          </Modal>
        </Suspense>
      )}
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
      {ledger.transactions.length + ledger.transfers.length >= 90_000 && (
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
      <CloudProvider>
        <WorkspaceApp />
      </CloudProvider>
    </AppBoundary>
  );
}
function WorkspaceApp() {
  const { active } = useCloud();
  return (
    <LedgerProvider key={active?.id ?? "local"}>
      <Shell />
    </LedgerProvider>
  );
}
