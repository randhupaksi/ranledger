# Operasi, Privasi, dan Deployment

## Menjalankan lokal

```bash
npm ci
npm run dev
```

`npm run dev` menyalakan Vite di `http://localhost:5173` dan API di `127.0.0.1:8787`.
Tanpa `DATABASE_URL`, server development menggunakan PGlite pada `.cache/server-data`.
Penyimpanan ledger browser terikat pada origin browser; pindah port, host, protokol,
atau browser berarti data lokal tidak ikut pindah.

Gunakan `.env.example` sebagai daftar nama environment. Jangan commit file `.env`
atau connection string nyata. `APP_ORIGIN` harus identik dengan origin aplikasi
untuk mutasi API. `TRUST_PROXY=1` hanya benar di belakang proxy yang dipercaya
dan menulis ulang `X-Forwarded-For`.

## Mode produksi

Cloud produksi memerlukan `DATABASE_URL` PostgreSQL yang persisten dan `APP_ORIGIN` HTTPS.
Tanpa database produksi, backend menolak konfigurasi yang tidak aman; mode ledger lokal tetap
berfungsi di browser. API dapat dijalankan dengan `npm run start:api` atau adaptor
`api/[...path].ts` pada Vercel.

Vite menghasilkan PWA. Hosting harus menyediakan:

- HTTPS dan SPA history fallback ke `index.html`.
- Service worker dan aset build dari origin yang sama.
- Header keamanan setara `vite.config.ts` dan `public/_headers`.
- Origin API yang sesuai dengan konfigurasi frontend.

## Keamanan server

- Cookie sesi cloud bersifat HttpOnly. Password menggunakan scrypt dan token/recovery code disimpan
  dalam bentuk hash.
- Middleware memeriksa origin mutasi, content type, session, dan batas percobaan.
- `space_id` serta membership membatasi akses record cloud. Owner mengatur anggota; editor dapat
  menulis; viewer membaca saja.
- API tidak boleh mengirim detail database, hash password, token mentah, atau recovery hash.
- Transport sync besar memiliki batas ukuran, masa berlaku, serta binding ke user.

Jika mengubah auth, session, CORS, role, schema server, atau sync, perlakukan sebagai perubahan
keamanan dan kontrak. Perbarui dokumentasi API dan jalankan tes server serta E2E yang relevan.

## Privasi pengguna

Ranledger tidak membutuhkan analytics atau session replay. Data finansial di IndexedDB mudah
diakses oleh orang yang menguasai profil browser pengguna; ini bukan enkripsi at-rest. JSON dan
Excel backup juga tidak terenkripsi. `.rledger` memberi enkripsi berbasis frasa sandi, tetapi tidak
menggantikan kebiasaan backup yang aman.

Jangan menyatakan aplikasi sebagai end-to-end encrypted atau menjanjikan recovery untuk frasa
sandi, recovery code, dan file backup yang hilang.

## Pemulihan operasional

- Buat backup sebelum memindah origin atau melakukan perubahan data besar.
- Gunakan pratinjau pemulihan; operasi `Ganti` memiliki konfirmasi teks untuk mengurangi kesalahan.
- Jika PWA menawarkan pembaruan, selesaikan input aktif terlebih dahulu.
- Untuk masalah cloud, periksa status sesi, ruang aktif, antrean, konflik, dan koneksi sebelum
  menyarankan reset data lokal.
