import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarDays } from "lucide-react";
import { useLedger, useNotify } from "../../components/LedgerProvider";
import {
  EmptyState,
  PageHeading,
  Pagination,
  ErrorNotice,
} from "../../components/ui";
import { SelectField } from "../../components/SelectField";
import { AmountField } from "../../components/planning-ui";
import { DatePicker } from "../../components/DatePicker";
import { EditorDialog } from "../../components/EditorDialog";
import { db } from "../../data/database";
import { MonthCalendar } from "./MonthCalendar";
import {
  addDays,
  calendarItems,
  forecast,
  type CalendarItem,
} from "../../domain/forecast";
import { isLiability } from "../../domain/finance";
import {
  dateLabel,
  localDate,
  money,
  parseAmount,
  errorMessage,
} from "../../domain/ledger";
const sourceLabels = {
  transaction: "Sudah dicatat",
  transfer: "Transfer tercatat",
  schedule: "Jadwal rutin",
  liability: "Rencana pembayaran",
  goal: "Tenggat target",
  scenario: "Simulasi",
};
export default function Calendar() {
  const ledger = useLedger(),
    notify = useNotify(),
    hidden = ledger.preferences.hideAmounts,
    today = localDate();
  const [days, setDays] = useState("30"),
    [wallet, setWallet] = useState("all"),
    [page, setPage] = useState(1),
    [scenario, setScenario] = useState<CalendarItem | undefined>(),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(addDays(today, 7)),
    [source, setSource] = useState(
      ledger.wallets.find((w) => !w.archived && !isLiability(w))?.id ?? "",
    ),
    [kind, setKind] = useState("expense"),
    [category, setCategory] = useState(""),
    [error, setError] = useState(""),
    [record, setRecord] = useState(false);
  const [view, setView] = useState("agenda"),
    [selectedDay, setSelectedDay] = useState("");
  const result = useMemo(
    () => forecast(ledger, Number(days), scenario),
    [
      ledger.wallets,
      ledger.transactions,
      ledger.transfers,
      ledger.schedules,
      ledger.liabilities,
      days,
      scenario,
    ],
  );
  const items = useMemo(() => {
    const rows = calendarItems(ledger, today, result.end);
    if (scenario) rows.push(scenario);
    return rows
      .filter(
        (i) =>
          wallet === "all" ||
          i.walletId === wallet ||
          i.targetWalletId === wallet,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [ledger, days, scenario, wallet]);
  const dayBalances = new Map(result.points.map((p) => [p.date, p.balance]));
  let dayBalance = result.startBalance;
  const values = Array.from({ length: Number(days) + 1 }, (_, i) => {
      dayBalance = dayBalances.get(addDays(today, i)) ?? dayBalance;
      return dayBalance;
    }),
    min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || 1;
  const chart = values
    .map(
      (value, index) =>
        `${16 + (index / Math.max(1, values.length - 1)) * 768},${130 - ((value - min) / span) * 105}`,
    )
    .join(" ");
  return (
    <>
      <PageHeading
        eyebrow="RENCANA KE DEPAN"
        title="Kalender & arus kas"
        description="Periksa kejadian yang akan datang dan dampaknya terhadap dana. Proyeksi dihitung dari catatan dan jadwal yang kamu masukkan."
      />
      <nav className="planning-tabs" aria-label="Perencanaan">
        <Link to="/rencana">Transaksi rutin</Link>
        <Link to="/rencana/tujuan">Target tabungan</Link>
        <Link className="active" to="/kalender">
          Kalender & proyeksi
        </Link>
      </nav>
      <section className="v3-forecast">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PROYEKSI DANA ASET</span>
            <h2>{money(result.endBalance, hidden)}</h2>
            <p>
              Perkiraan pada{" "}
              {dateLabel(result.end, ledger.preferences.dateFormat)}
            </p>
          </div>
          <SelectField
            aria-label="Rentang proyeksi"
            value={days}
            onValueChange={(v) => {
              setDays(v);
              setPage(1);
            }}
            options={[
              { value: "30", label: "30 hari" },
              { value: "90", label: "90 hari" },
            ]}
          />
        </div>
        {!hidden && (
          <svg
            viewBox="0 0 800 155"
            className="forecast-chart"
            role="img"
            aria-label={`Dari ${money(result.startBalance)} menjadi ${money(result.endBalance)} dalam ${days} hari`}
          >
            <line x1="16" x2="784" y1="135" y2="135" />
            <polyline
              points={chart}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <text x="16" y="153">
              Hari ini
            </text>
            <text x="784" y="153" textAnchor="end">
              {dateLabel(result.end, "short")}
            </text>
          </svg>
        )}
        <div className="forecast-legend">
          <span>
            Saldo aset hari ini{" "}
            <strong>{money(result.startBalance, hidden)}</strong>
          </span>
          <span>{result.points.length} kejadian yang memengaruhi saldo</span>
          {scenario && <span className="status-tag">Memuat simulasi</span>}
        </div>
        {result.low && (
          <div className="v3-warning" role="status">
            Proyeksi dana gabungan negatif mulai {dateLabel(result.low.date)}{" "}
            setelah {result.low.item.name}.
          </div>
        )}
        {[...result.balances]
          .filter(
            ([id, balance]) =>
              balance < 0 &&
              !isLiability(ledger.wallets.find((w) => w.id === id)!),
          )
          .map(([id, balance]) => (
            <p key={id} className="v3-warning">
              {ledger.wallets.find((w) => w.id === id)?.name} diproyeksikan{" "}
              {money(balance, hidden)} pada akhir periode.
            </p>
          ))}
        <p className="field-hint">
          Saldo awal proyeksi mencakup transaksi sampai hari ini. Transaksi
          mendatang dihitung satu kali; kejadian jadwal yang sudah dicatat
          dilewati. Pembayaran utang mengurangi aset dan kewajiban. Tenggat
          target hanya pengingat. Suku bunga dan pemasukan tidak pasti tidak
          diasumsikan.
        </p>
      </section>
      <section className="v3-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">COBA KEPUTUSAN</span>
            <h2>Simulasi keputusan</h2>
            <p>Simulasi tidak mengubah transaksi atau saldo tercatat.</p>
          </div>
          {scenario && (
            <button
              className="button secondary"
              onClick={() => setScenario(undefined)}
            >
              Hapus simulasi
            </button>
          )}
        </div>
        <form
          className="scenario-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (date <= today || date > result.end)
                throw new Error(
                  "Pilih tanggal setelah hari ini dan dalam rentang proyeksi.",
                );
              if (!source) throw new Error("Pilih akun aset aktif.");
              setScenario({
                id: "scenario",
                name:
                  kind === "expense"
                    ? "Simulasi pembelian"
                    : "Simulasi pemasukan",
                date,
                walletId: source,
                amount: parseAmount(amount),
                kind: kind as "expense" | "income",
                source: "scenario",
              });
              setError("");
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          <div className="field">
            <label htmlFor="scenario-kind">Jenis skenario</label>
            <SelectField
              id="scenario-kind"
              value={kind}
              onValueChange={setKind}
              options={[
                { value: "expense", label: "Pengeluaran" },
                { value: "income", label: "Pemasukan" },
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="scenario-wallet">Akun skenario</label>
            <SelectField
              id="scenario-wallet"
              value={source}
              onValueChange={setSource}
              options={ledger.wallets
                .filter((w) => !isLiability(w) && !w.archived)
                .map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
          <AmountField
            label="Nominal skenario (Rp)"
            value={amount}
            onChange={setAmount}
          />
          <div className="field">
            <label htmlFor="scenario-date">Tanggal skenario</label>
            <DatePicker
              id="scenario-date"
              min={addDays(today, 1)}
              max={result.end}
              value={date}
              onChange={setDate}
            />
          </div>
          <button className="button primary">Terapkan simulasi</button>
        </form>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {scenario && (
          <div className="v3-actions">
            <p>
              Simulasi aktif: {money(scenario.amount, hidden)} pada{" "}
              {dateLabel(scenario.date)}
            </p>
            <button
              className="button secondary small-button"
              onClick={() => setRecord(true)}
            >
              Jadikan transaksi
            </button>
          </div>
        )}
      </section>
      <section className="v3-section">
        <div className="section-heading">
          <h2>Agenda keuangan</h2>
          <SelectField
            aria-label="Akun agenda"
            value={wallet}
            onValueChange={(v) => {
              setWallet(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "Seluruh akun" },
              ...ledger.wallets.map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
        </div>
        <div className="calendar-toolbar">
          <div className="tabs" role="group" aria-label="Tampilan kalender">
            <button
              className={view === "agenda" ? "active" : ""}
              onClick={() => {
                setView("agenda");
                setSelectedDay("");
                setPage(1);
              }}
            >
              Agenda
            </button>
            <button
              className={view === "month" ? "active" : ""}
              onClick={() => setView("month")}
            >
              Bulanan
            </button>
          </div>
          {selectedDay && (
            <button
              className="button secondary small-button"
              onClick={() => {
                setSelectedDay("");
                setPage(1);
              }}
            >
              Tampilkan semua tanggal
            </button>
          )}
        </div>
        {view === "month" && (
          <MonthCalendar
            items={items}
            start={today}
            end={result.end}
            selected={selectedDay}
            onSelect={(day) => {
              setSelectedDay(day);
              setPage(1);
            }}
          />
        )}
        {selectedDay && <h3>Agenda {dateLabel(selectedDay)}</h3>}
        {!items.filter((item) => !selectedDay || item.date === selectedDay)
          .length ? (
          <EmptyState
            compact
            icon={CalendarDays}
            title={
              selectedDay
                ? "Tidak ada agenda pada tanggal ini"
                : "Belum ada agenda mendatang"
            }
            description="Jadwal rutin, jatuh tempo, dan transaksi mendatang akan muncul di sini."
            action={
              <Link to="/rencana" className="button secondary small-button">
                Atur transaksi rutin
              </Link>
            }
          />
        ) : (
          <>
            <div className="v3-register">
              {items
                .filter((item) => !selectedDay || item.date === selectedDay)
                .slice((page - 1) * 30, page * 30)
                .map((item) => (
                  <div
                    className="v3-row agenda-row"
                    key={`${item.source}:${item.id}`}
                  >
                    <time dateTime={item.date}>
                      {dateLabel(item.date, "short")}
                    </time>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {
                          ledger.wallets.find((w) => w.id === item.walletId)
                            ?.name
                        }{" "}
                        · {sourceLabels[item.source]}
                      </small>
                    </div>
                    <strong
                      className={item.kind === "income" ? "income-text" : ""}
                    >
                      {item.kind === "income" ? "+" : ""}
                      {money(item.amount, hidden)}
                    </strong>
                    <Link
                      className="text-link"
                      to={
                        item.source === "schedule"
                          ? "/rencana"
                          : item.source === "liability"
                            ? "/kewajiban"
                            : item.source === "goal"
                              ? "/rencana/tujuan"
                              : "/transaksi"
                      }
                    >
                      Buka
                    </Link>
                  </div>
                ))}
            </div>
            <Pagination
              page={page}
              count={
                items.filter(
                  (item) => !selectedDay || item.date === selectedDay,
                ).length
              }
              onChange={setPage}
              noun="agenda"
            />
          </>
        )}
      </section>
      {record && scenario && (
        <EditorDialog
          title="Catat skenario ini"
          description="Setelah disimpan, transaksi ikut saldo tercatat dan skenario dihapus dari simulasi."
          saveLabel="Catat transaksi skenario"
          onClose={() => setRecord(false)}
          onSave={async () => {
            const categoryId =
              category ||
              ledger.categories.find(
                (c) => c.kind === scenario.kind && !c.archived,
              )?.id;
            if (!categoryId) throw new Error("Pilih kategori aktif.");
            const at = new Date().toISOString();
            await db.saveTransaction(
              {
                id: crypto.randomUUID(),
                kind: scenario.kind as "income" | "expense",
                amount: scenario.amount,
                walletId: scenario.walletId,
                categoryId,
                date: scenario.date,
                note: scenario.name,
                createdAt: at,
                updatedAt: at,
              },
              false,
            );
            setScenario(undefined);
            notify("Skenario dicatat sebagai transaksi.");
          }}
        >
          <div className="field">
            <label htmlFor="scenario-category">Kategori transaksi</label>
            <SelectField
              id="scenario-category"
              value={
                category ||
                ledger.categories.find(
                  (c) => c.kind === scenario.kind && !c.archived,
                )?.id ||
                ""
              }
              onValueChange={setCategory}
              options={ledger.categories
                .filter((c) => c.kind === scenario.kind && !c.archived)
                .map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
        </EditorDialog>
      )}
    </>
  );
}
