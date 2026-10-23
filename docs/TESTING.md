# Pengujian dan Validasi

## Perintah

| Perintah               | Cakupan                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `npm run typecheck`    | Kontrak TypeScript tanpa menulis build                                  |
| `npm run lint`         | Pemeriksaan statis Oxlint                                               |
| `npm run format:check` | Konsistensi Prettier                                                    |
| `npm test`             | Domain, database, backup, server, dan integrasi terfokus melalui Vitest |
| `npm run build`        | Typecheck dan production bundle Vite/PWA                                |
| `npm run test:e2e`     | Alur browser terisolasi melalui Playwright                              |
| `npm run verify`       | Lint, format, unit, build, dan E2E                                      |

Pilih pemeriksaan berdasarkan batas yang berubah. Dokumentasi saja cukup ditinjau untuk akurasi
path dan link. Perubahan domain, storage, backup, cloud, atau server memerlukan tes yang lebih luas.

## Unit dan integrasi

Tes di `src/**/*.test.ts` dan `server/**/*.test.ts` melindungi aturan yang rawan regresi:

- Perhitungan pemasukan, pengeluaran, transfer, periode, dan batas skala.
- Validasi referensi dan rollback database.
- Kompatibilitas backup/import JSON serta Excel.
- Perilaku v2/v3 dan data ledger.
- Session serta route API dengan database sintetis.

Gunakan fixture sintetis. Jangan membangun test dari export, cookie, atau data keuangan pengguna.

## End-to-end

`e2e/ranledger.spec.ts` menjalankan API PGlite in-memory serta Vite preview dengan port uji tersendiri.
Flow mencakup pencatatan, validasi form, backup/restore, kategori, layout/tema, offline, volume data,
persistensi, dompet/anggaran/rencana, impor CSV, kewajiban, enkripsi backup, sinkronisasi,
kolaborasi ruang, dan rekonsiliasi.

Artefak test berada di `.cache/` dan diabaikan Git. Kegagalan browser dapat menyimpan screenshot dan
trace untuk diagnosis. Jangan menggunakan profile browser reguler sebagai environment test.

## Panduan pemilihan pemeriksaan

| Perubahan                              | Pemeriksaan minimum yang relevan                                          |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Copy, docs, atau stylesheet terisolasi | Review diff; build bila bundling/import berubah                           |
| Komponen/route                         | Typecheck, lint, build; E2E atau browser manual untuk flow interaktif     |
| Domain atau validasi                   | Typecheck, lint, unit terkait, build                                      |
| Dexie, backup, CSV, atau Excel         | Unit data, build, E2E impor/pemulihan terkait                             |
| Cloud, role, auth, atau API            | Server/unit terkait, build, E2E sinkronisasi/ruang terkait                |
| PWA/offline                            | Build dan E2E offline; verifikasi manual bila konfigurasi hosting berubah |

Hasil validasi harus melaporkan pemeriksaan yang benar-benar dijalankan serta keterbatasannya.
