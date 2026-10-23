# Ranledger — Agent Guide

> Panduan utama bagi AI agent dan kontributor. `CLAUDE.md` hanya menunjuk ke file ini.
> Baca dokumen yang relevan sebelum mengubah kode: [arsitektur](docs/ARCHITECTURE.md),
> [model data](docs/DATA_MODEL.md), [desain](docs/DESIGN.md), [operasi](docs/OPERATIONS.md),
> dan [pengujian](docs/TESTING.md).

## 1. Tujuan produk

Ranledger adalah aplikasi keuangan pribadi berbahasa Indonesia yang bersifat **local-first**.
Ledger standar tinggal di browser pengguna dan tetap dapat dipakai offline. Pengguna dapat
secara sadar mengaktifkan akun serta ruang cloud untuk sinkronisasi atau kolaborasi. Cloud
tidak boleh menjadi prasyarat untuk mencatat keuangan lokal.

Nilai utama yang harus dipertahankan adalah ketelitian perhitungan, kepemilikan data pengguna,
kejelasan status, dan kemampuan pemulihan. Ini adalah alat keuangan pribadi, bukan dashboard
SaaS generik.

## 2. Stack dan perintah

| Area              | Teknologi                                             |
| ----------------- | ----------------------------------------------------- |
| Aplikasi          | React 19, TypeScript, Vite 8, React Router 8          |
| Penyimpanan lokal | Dexie / IndexedDB                                     |
| Validasi          | Zod                                                   |
| UI                | CSS tokens, Tailwind 4, Base UI, Radix Select, Lucide |
| Offline           | `vite-plugin-pwa` / Workbox                           |
| API opsional      | Hono, Node, PostgreSQL atau PGlite untuk development  |
| Tes               | Vitest dan Playwright                                 |

Gunakan Node 24 LTS dan npm dengan `package-lock.json`.

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run format:check
```

`npm run verify` menjalankan rangkaian penuh. Browser test memakai data dan profil terisolasi;
jangan arahkan pengujian ke data atau database pengguna.

## 3. Batas arsitektur

```text
UI route/feature → LedgerProvider / CloudProvider → data + domain
                                         ├─ Dexie / IndexedDB
                                         └─ /api → Hono → PostgreSQL/PGlite
```

- `src/domain/` berisi tipe, aturan keuangan, validasi, jurnal, proyeksi, dan merge sinkronisasi.
  Modul ini harus murni dan tidak mengakses React, Dexie, atau HTTP.
- `src/data/` memiliki penyimpanan browser, backup, CSV, ekspor Excel, enkripsi, dan transport cloud.
- `src/components/` berisi konteks, primitive aksesibel, dan pola tampilan bersama.
- `src/features/` memiliki UI menurut domain. Jangan memindahkan aturan ledger ke komponen.
- `server/` berisi transport HTTP, autentikasi, transaksi database, dan validasi sinkronisasi.
- `api/[...path].ts` hanya adaptor Vercel menuju server yang sama.

Periksa [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sebelum mengubah batas antar-layer.

## 4. Invarian ledger — jangan diubah sembarangan

- Mata uang adalah IDR rupiah bulat. Nominal transaksi positif dan maksimal Rp1 triliun.
- Tanggal keuangan adalah kalender lokal `YYYY-MM-DD`; jangan mengubahnya ke UTC.
- Saldo tercatat = saldo awal seluruh dompet + pemasukan − pengeluaran.
- Transfer mengubah saldo kedua dompet, tetapi tidak mengubah saldo gabungan atau arus kas.
- Pembelian kredit mencatat beban satu kali. Pembayaran kewajiban memakai transfer.
- Refund mengurangi beban kategori, bukan pemasukan baru.
- Referensi antar-entitas harus valid; operasi impor dan sinkronisasi harus atomik.
- Kategori terarsip tetap dapat menjelaskan riwayat. Jangan menghapus makna transaksi lama.

Perubahan pada `src/domain/ledger.ts`, `validation.ts`, `finance.ts`, `planning.ts`, atau `sync.ts`
dapat memengaruhi perhitungan, backup, impor, cloud, dan laporan sekaligus. Petakan seluruh
konsumen sebelum mengubahnya.

## 5. Privasi, data, dan cloud

- Jangan menambah analytics, session replay, tracker, atau skrip pihak ketiga yang memperoleh data finansial.
- Jangan log transaksi, catatan, token, kata sandi, recovery code, cookie sesi, atau connection string.
- Jangan baca, salin, atau jadikan fixture data dari ledger browser maupun database pengguna.
- Data lokal IndexedDB tidak terenkripsi. Backup JSON/Excel juga tidak terenkripsi; `.rledger` memakai
  frasa sandi. Jelaskan batas ini secara jujur bila mengubah copy terkait.
- Cloud bersifat opt-in. Jangan mengunggah ledger lokal otomatis saat pengguna membuat akun atau login.
- Server harus selalu memeriksa sesi, membership ruang, peran, origin mutasi, validasi Zod, dan
  invariant ledger. `viewer` tidak dapat mengirim perubahan.
- Mutasi sinkronisasi memakai idempotency ID dan konflik harus tetap ditinjau pengguna; jangan memilih
  versi lokal atau remote secara diam-diam.

Lihat [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), dan
[docs/api-v3.md](docs/api-v3.md) untuk detail kontrak.

## 6. UI, aksesibilitas, dan offline

- Ikuti token CSS dari `src/styles/`; jangan membuat sistem warna atau ukuran baru di feature.
- Gunakan primitive yang sudah ada (`Modal`, `SelectField`, `DatePicker`, `ui.tsx`) sebelum membuat ulang pola kontrol.
- Pertahankan sidebar desktop, navigasi bawah mobile, fokus keyboard, Escape/focus management dialog,
  skip link, touch target praktis, dan reduced motion.
- Status loading, kosong, error, disabled, dan sukses harus jujur terhadap kondisi data.
- UI offline harus dapat menjelaskan koneksi tanpa menghambat ledger lokal.
- PWA meminta pembaruan secara eksplisit; jangan memuat ulang ketika pengguna sedang mengedit.

Gunakan [docs/DESIGN.md](docs/DESIGN.md) sebagai sumber aturan visual.

## 7. Checklist sebelum handoff

- [ ] Perubahan mengikuti data flow dan tidak melewati layer yang sudah ada.
- [ ] Invarian keuangan, validasi referensi, dan perilaku backup/sinkronisasi tetap terjaga.
- [ ] Tidak ada data keuangan, kredensial, atau token di source, log, test, atau dokumentasi.
- [ ] UI tetap memakai token serta primitive yang ada; keyboard, focus, dan mobile terjaga.
- [ ] Menjalankan pemeriksaan yang proporsional: minimal typecheck/lint/build untuk kode; tambah unit atau E2E saat kontrak atau alur berubah.
- [ ] Meninjau diff untuk data contoh, endpoint, atau perubahan kontrak yang tidak disengaja.

Jangan mengubah environment contract, konfigurasi deployment, skema database produksi, Git history,
commit, atau push tanpa instruksi eksplisit.
