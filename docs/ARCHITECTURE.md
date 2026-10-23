# Arsitektur Ranledger

## Gambaran sistem

Ranledger adalah aplikasi React local-first. Semua fungsi inti bekerja dengan ledger di browser.
Cloud menambahkan akun, ruang bersama, dan sinkronisasi sebagai pilihan pengguna.

```text
Browser
  React routes + feature UI
       │
       ├── LedgerProvider ── Dexie / IndexedDB (ledger lokal)
       │
       └── CloudProvider ── /api ── Hono ── PostgreSQL
                                └── PGlite pada development tanpa DATABASE_URL
```

PWA menyimpan aset build agar UI dan data lokal tetap dapat dipakai offline. Ia tidak menjadikan
cloud tersedia tanpa jaringan.

## Frontend

### Bootstrap dan shell

- `src/main.tsx` memasang React, `BrowserRouter`, feedback sentuhan, stylesheet, dan pemulihan
  pilihan ruang cloud.
- `src/App.tsx` memiliki layout aplikasi, navigasi, registrasi service worker, modal pencatatan cepat,
  error boundary, dan route. Halaman feature selain dashboard dimuat lazy.
- `LedgerProvider` membentuk satu `Ledger` dari tabel Dexie melalui `useLiveQuery` dan menyediakan
  toast, tema, serta akses edit.
- `CloudProvider` mengelola sesi, ruang aktif, antrean mutasi, pull/push, konflik, dan peran.

### Route

| Path                          | Feature                                          |
| ----------------------------- | ------------------------------------------------ |
| `/`                           | Beranda dan ringkasan finansial                  |
| `/transaksi`                  | Pencatatan, filter, dan edit transaksi           |
| `/laporan`                    | Laporan dan posisi finansial                     |
| `/dompet`, `/kewajiban`       | Aset, rekening, dan kewajiban                    |
| `/anggaran`                   | Anggaran kategori                                |
| `/rencana`, `/rencana/tujuan` | Jadwal berulang dan target tabungan              |
| `/kalender`                   | Kalender serta proyeksi arus kas                 |
| `/impor`, `/rekonsiliasi`     | Impor CSV dan rekonsiliasi laporan               |
| `/backup`                     | Backup, pemulihan, dan enkripsi                  |
| `/pengaturan`                 | Preferensi, kategori, dan pengaturan penyimpanan |
| `/ruang`                      | Akun, ruang, anggota, dan sinkronisasi cloud     |

### Batas frontend

| Lokasi            | Tanggung jawab                                                                |
| ----------------- | ----------------------------------------------------------------------------- |
| `src/domain/`     | Aturan bisnis murni: tipe, validasi, hitungan, jurnal, proyeksi, merge        |
| `src/data/`       | Infrastruktur browser: Dexie, backup, CSV worker, Excel, enkripsi, HTTP cloud |
| `src/components/` | Provider, primitive aksesibel, dan pola tampilan lintas fitur                 |
| `src/features/`   | Komposisi UI dan interaksi menurut domain                                     |
| `src/styles/`     | Token, komponen, layout, breakpoint, dan reduced motion                       |

`features` boleh memakai domain/data yang relevan. `domain` tidak boleh bergantung pada React,
Dexie, API, atau markup. Jangan menaruh aturan saldo atau validasi ledger di komponen.

## Penyimpanan lokal dan backup

`src/data/database.ts` mendefinisikan `LedgerDatabase` Dexie. Tabel terpisah menyimpan transaksi,
kategori, dompet, transfer, anggaran, jadwal, target, kewajiban, batch impor, aturan kategori, dan
metadata preferensi. Pemisahan ini memungkinkan UI merespons tabel yang berubah tanpa membuat
seluruh snapshot baru.

Backup/impor ada di `src/data/backup.ts`. CSV diurai pada worker terpisah (`csv.worker.ts`) agar
UI tetap responsif. Ekspor laporan Excel dipisahkan dari format backup; report mengikuti filter
yang aktif dan bukan salinan ledger penuh.

## Cloud dan API

`src/data/cloud.tsx` menyimpan state integrasi cloud serta menerjemahkan perubahan Dexie menjadi
mutation sync. Server tidak menerima ledger sebagai sumber kebenaran tanpa validasi: setiap batch
harus lolos schema entitas, membership, peran, konflik, dan `validateLedger` sebelum ditulis.

```text
Perubahan lokal → snapshot record → mutation (before/after)
  → POST /spaces/:id/sync → validasi & merge server
  → delta/revision atau konflik 409 → pilihan pengguna
```

Perangkat pembaca dapat menarik delta tetapi tidak dapat mengirim perubahan. Mutasi identik aman
diulang dengan ID operasi dan hash payload. Payload/respons besar memakai transport potongan yang
tetap terikat ke user. Detail endpoint berada di [api-v3.md](api-v3.md).

## Backend

| Lokasi                | Tanggung jawab                                                             |
| --------------------- | -------------------------------------------------------------------------- |
| `server/index.ts`     | Bootstrap Node, env, database, dan graceful shutdown                       |
| `server/app.ts`       | Hono app, middleware keamanan, route akun/ruang/sinkronisasi               |
| `server/auth.ts`      | Token, hash password scrypt, dan perbandingan aman                         |
| `server/database.ts`  | Adapter PostgreSQL/PGlite dan transaksi                                    |
| `server/schema.ts`    | Tabel pengguna, sesi, ruang, record, operasi, invite, audit, dan transport |
| `server/transport.ts` | Potongan unggahan/unduhan sinkronisasi besar                               |
| `api/[...path].ts`    | Entry Vercel untuk aplikasi Hono yang sama                                 |

Server memisahkan record per `space_id`. Akses resource ruang selalu harus dimulai dari membership
user yang terautentikasi; role owner/editor/viewer menentukan kemampuan mutasi.

## Batas perubahan penting

- Perubahan bentuk `Ledger` wajib diperiksa terhadap Dexie, backup JSON/Excel, import lama, schema
  Zod, jurnal, proyeksi, sinkronisasi, cloud server, dan test.
- Perubahan API wajib memperbarui `docs/api-v3.md` dan mempertahankan error JSON yang aman.
- Perubahan offline/PWA harus mempertahankan prompt update serta tidak menghapus data lokal.
- Perubahan route harus memperbarui navigasi dan test E2E bila alur pengguna berubah.
