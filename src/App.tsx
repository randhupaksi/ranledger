import { WalletCards } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

function UpdateNotice() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-10 mx-auto flex max-w-lg items-center justify-between gap-4 rounded-xl border border-line bg-white p-4 shadow-lg sm:inset-x-auto sm:right-6"
      role="status"
    >
      <p className="text-sm text-ink">
        {offlineReady
          ? "Ranledger siap dibuka saat offline."
          : "Pembaruan Ranledger tersedia."}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {needRefresh && (
          <button
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => void updateServiceWorker(true)}
            type="button"
          >
            Perbarui
          </button>
        )}
        <button
          aria-label="Tutup pemberitahuan"
          className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={dismiss}
          type="button"
        >
          Tutup
        </button>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-[72px] w-full max-w-6xl items-center gap-3 px-5 sm:px-8">
          <div className="grid size-10 place-items-center rounded-xl bg-brand text-white">
            <WalletCards aria-hidden="true" size={21} strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">Ranledger</p>
            <p className="text-xs text-muted">Keuangan pribadi</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8">
        <section aria-labelledby="welcome-title" className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
            Pencatatan keuangan pribadi
          </p>
          <h1
            className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
            id="welcome-title"
          >
            Ranledger
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted sm:text-lg">
            Fondasi project sudah siap. Kita akan membangun alur transaksi dan
            penyimpanan lokal mengikuti PRD.
          </p>
        </section>
      </main>

      <UpdateNotice />
    </div>
  );
}
