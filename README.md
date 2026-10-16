# Ranledger

Aplikasi pencatatan keuangan pribadi dengan pendekatan local-first. Data transaksi direncanakan tetap berada di browser pengguna; belum ada backend atau akun pengguna.

## Menjalankan project

Gunakan Node.js `22.22.0` (jalur 22), `24.x`, atau `26+` dan npm. Node `24` disarankan; file `.nvmrc` memilih jalur itu. Node `23.x` yang tersedia di mesin ini bukan versi yang didukung Vitest 5.

```bash
npm install
npm run dev
```

## Perintah

- `npm run dev` — server pengembangan.
- `npm run build` — pemeriksaan TypeScript lalu build produksi.
- `npm run preview` — pratinjau build produksi.
- `npm run lint` — pemeriksaan statis dengan Oxlint.
- `npm test` — menjalankan Vitest setelah test ditambahkan.

## Fondasi teknis

- React, TypeScript, Vite, dan React Router untuk aplikasi web.
- Tailwind CSS 4 dengan token CSS; Base UI disiapkan untuk komponen interaktif yang membutuhkan perilaku aksesibel.
- Dexie untuk IndexedDB, Zod untuk validasi data impor/backup, dan SheetJS untuk berkas Excel.
- `vite-plugin-pwa` menyiapkan cache app shell offline. Pembaruan aplikasi meminta persetujuan pengguna sebelum memuat ulang.
- Tidak ada SDK analitik, backend, autentikasi, atau layanan sinkronisasi cloud.

Versi dependency ditulis secara exact di `package.json`; `package-lock.json` mengunci seluruh dependency transitif.

`.npmrc` mengaktifkan legacy peer resolution untuk npm 11.1.0. Resolver npm tersebut gagal saat memproses peer opsional browser/UI Vitest; peer wajib untuk aplikasi sudah dipasang eksplisit dan rentangnya cocok.
