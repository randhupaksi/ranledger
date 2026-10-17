# Ranledger

Aplikasi keuangan pribadi berbahasa Indonesia untuk mencatat pemasukan dan pengeluaran tanpa akun. Catatan disimpan di browser pada perangkat pengguna. Tidak ada backend, analytics, session replay, atau sinkronisasi cloud.

## Menjalankan aplikasi

Gunakan Node.js **24 LTS** (sesuai `.nvmrc`) dan npm. Dependency dikunci dengan versi exact dan `package-lock.json`.

```bash
npm ci
npm run dev
```

Build dan pratinjau produksi, termasuk mode offline:

```bash
npm run build
npm run preview
```

Service worker aktif di build produksi. Tunggu pemberitahuan kesiapan offline sebelum memutus koneksi. Seluruh halaman, formulir, dan modul Excel ikut disiapkan untuk offline. Pembaruan meminta tindakan pengguna; selesaikan formulir sebelum memperbarui.

Penyimpanan terikat ke alamat situs (protokol, host, dan port), selain browser/perangkat. Berpindah dari server dev ke preview, mengganti port, atau pindah domain tidak memindahkan data otomatis. Buat backup lalu pulihkan di alamat tujuan.

## Fitur

- **Beranda:** saldo tercatat, saldo awal, ringkasan periode, transaksi terakhir, rincian pengeluaran, dan pengingat backup setelah tujuh hari.
- **Transaksi:** pemasukan/pengeluaran, edit, konfirmasi hapus, pencarian catatan/kategori, filter tanggal/jenis/kategori, pagination 30 baris, dan laporan Excel sesuai filter.
- **Laporan:** angka pemasukan, pengeluaran, selisih, grafik arus kas dengan penjelasan teks, kategori pengeluaran, perbandingan periode, dan tautan ke transaksi pembentuk angka.
- **Backup & pemulihan:** backup lengkap JSON/Excel, pratinjau, gabung/ganti, deteksi ID ganda/konflik, validasi referensi, pemeriksaan hasil pemulihan, serta uji contoh terpisah dari catatan asli.
- **Pengaturan:** tema terang/gelap/perangkat, format tanggal, sembunyikan nominal, saldo awal, tambah/ubah/arsip/aktifkan kategori, informasi penyimpanan, permintaan persistensi browser, dan reset dengan konfirmasi ketik.
- **Responsif:** navigasi samping desktop, navigasi bawah mobile, formulir sebagai panel bawah di HP, label aksesibel, focus trap dan Escape pada dialog, skip link, serta reduced motion.

Pada desktop, tekan **N** saat tidak sedang mengisi kontrol untuk membuka pencatatan baru.

## Aturan keuangan

Mata uang MVP adalah IDR dalam rupiah bulat, tanpa desimal. Nominal transaksi harus positif, maksimal Rp1 triliun per transaksi. Tanda jenis disimpan terpisah dari nominal. Input berformat `25.000` dan `25000` diterima; `1.5` dan `1,5` ditolak.

**Saldo tercatat = saldo awal + seluruh pemasukan − seluruh pengeluaran.** Saldo awal bisa negatif dan tidak masuk ke pemasukan laporan. Seluruh transaksi yang dicatat, termasuk tanggal mendatang jika pengguna memilihnya, masuk ke saldo tercatat. Ringkasan periode menghitung transaksi sesuai rentang yang ditampilkan, terpisah dari saldo keseluruhan.

Tanggal transaksi disimpan sebagai kalender `YYYY-MM-DD` tanpa konversi UTC. Minggu dimulai Senin; hari/minggu/bulan/tahun aktif berakhir pada hari ini. Periode lain bisa dipilih melalui rentang khusus. Timestamp pembuatan/perubahan hanya dipakai untuk metadata dan pengurutan stabil.

Jumlah pemasukan, pengeluaran, dan saldo diperiksa terhadap batas integer aman JavaScript. Maksimal 100.000 transaksi dan 1.000 kategori. Catatan dengan nominal besar dapat mencapai batas total sebelum batas jumlah transaksi; operasi akan ditolak dengan pesan tanpa merusak data.

Kategori yang diarsipkan tetap tersedia di riwayat dan saat mengedit transaksi lama. Nama kategori diperbarui di seluruh riwayat berdasarkan referensi ID. Jenis kategori yang sudah dibuat tidak diubah.

## Backup dan pemulihan

**Ekspor laporan** mengikuti filter dan hanya untuk dibaca. **Backup lengkap** selalu mencakup seluruh transaksi, kategori (termasuk arsip), saldo awal, dan preferensi. Gunakan JSON sebagai salinan utama. Backup tidak dienkripsi; simpan dengan hati-hati di lokasi yang kamu percaya.

Format backup v1 memiliki identitas `ranledger`, `formatVersion`, `currency`, dan `exportedAt`. Excel memakai empat lembar: `Ranledger`, `Transaksi`, `Kategori`, dan `Pengaturan`. Kolom, jenis nilai, dan ID harus tetap utuh agar dapat dipulihkan; file Excel umum bukan format impor MVP. Sel teks seperti catatan yang diawali `=` diekspor sebagai teks, bukan rumus. File yang berisi rumus atau VBA ditolak.

- **Gabung:** transaksi ber-ID baru ditambahkan. ID yang sudah ada dilewati dan versi lokal dipertahankan, termasuk ketika isi berbeda; jumlah konflik ditampilkan. Saldo awal dan preferensi lokal dipertahankan. Kategori dengan ID sama memakai versi lokal; kategori baru bernama/berjenis sama diarahkan ke kategori lokal. Jenis kategori yang bertentangan ditolak. Isi sama dengan ID berbeda tetap merupakan transaksi berbeda.
- **Ganti:** transaksi, kategori, saldo awal, dan preferensi diganti seluruhnya dari file. Diperlukan pratinjau dan ketikan `GANTI`. Backup lokal tersedia sebelum melanjutkan.

Impor berjalan dalam satu transaksi IndexedDB. Kegagalan validasi, penulisan, atau verifikasi membatalkan seluruh perubahan. Hasil dibaca dan dibandingkan sebelum sukses diumumkan. Perubahan di tab lain setelah pratinjau mengharuskan pengguna memperbarui pratinjau. Edit/hapus transaksi yang sudah berubah di tab lain juga ditolak.

Batas file impor adalah 256 MB untuk JSON dan 32 MB untuk Excel, dengan batas baris dan panjang field tetap berlaku. File besar memerlukan memori dan waktu lebih banyak; gunakan JSON untuk ledger besar. Waktu ekspor terakhir hanya menunjukkan file pernah dibuat, bukan jaminan file masih tersedia. Reset data memerlukan ketikan `HAPUS` dan menyediakan akses backup.

## Struktur implementasi

| Lokasi | Tanggung jawab |
| --- | --- |
| `src/domain/ledger.ts` | Schema, validasi uang/tanggal, perhitungan dan filter |
| `src/data/database.ts` | Penyimpanan Dexie, operasi atomik, konflik antar-tab |
| `src/data/backup.ts` | Format v1, Excel/JSON, perencanaan impor dan unduhan |
| `src/components` | Konteks data, dialog aksesibel dan pola tampilan bersama |
| `src/features` | Beranda, transaksi, laporan, backup dan pengaturan |
| `src/style.css` | Token terang/gelap, tampilan halaman dan responsivitas |
| `src/**/*.test.ts` | Pengujian domain, file backup dan kegagalan penyimpanan |
| `e2e/ranledger.spec.ts` | Alur browser terpisah, offline dan screenshot |

React/TypeScript/Vite/React Router menangani aplikasi; Tailwind CSS 4 dan token CSS menjadi fondasi gaya. Base UI mengelola dialog dan fokus, sedangkan Radix UI Select mengelola dropdown. Dexie menyimpan IndexedDB, Zod memvalidasi data, SheetJS menangani Excel, dan `vite-plugin-pwa` menyiapkan cache offline. Halaman tambahan, dialog, dan Excel dimuat sesuai kebutuhan.

## Validasi

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run format:check
```

Playwright menggunakan Microsoft Edge yang terpasang (`channel: msedge`) dalam profil uji terisolasi di `.cache/browser`. Data asli pada browser biasa tidak digunakan. Server preview dimulai otomatis di port 4173; port tersebut harus kosong. Untuk lingkungan tanpa Edge, pasang browser yang sesuai dan ubah channel pada fixture pengujian.

Pengujian meliputi perhitungan setelah edit/hapus, tanggal lintas periode, 10.000 transaksi, roundtrip JSON/Excel, catatan berkarakter khusus, file tidak kompatibel/rusak, duplikasi, rollback kegagalan impor, konflik antar-tab, kategori arsip, browser dibuka ulang, tampilan mobile/desktop, tema, keyboard, dan offline. Screenshot browser tersimpan di `.cache/screenshots` untuk review visual; semua artefak uji diabaikan Git.

Node 23.8 di mesin pengembangan berada di luar rentang dukungan project/Vitest, walaupun perintah validasi saat implementasi dapat berjalan. Gunakan Node 24 LTS untuk pengembangan rutin dan CI. `.npmrc` mempertahankan `legacy-peer-deps=true` karena resolver npm 11.1 bermasalah pada peer opsional Vitest; dependency aplikasi dipasang eksplisit.

## Hosting dan batasan

Hasil build berada di `dist`. Hosting harus menyediakan **HTTPS**, fallback SPA ke `index.html`, dan file service worker pada origin yang sama. Menyajikan `_headers` didukung hosting seperti Netlify/Cloudflare Pages; pada hosting lain, terapkan header yang setara melalui konfigurasi server. Preview lokal sudah memasang header tersebut. CSP juga disisipkan ke HTML produksi sebagai perlindungan dasar.

Kebijakan membatasi script/koneksi ke origin sendiri, menolak object/frame embedding melalui header, mematikan akses kamera/mikrofon/lokasi, dan mengirim `nosniff` serta `no-referrer`. Jangan menambahkan script pihak ketiga yang mengakses data keuangan tanpa meninjau ulang kebijakan privasi.

Penyimpanan browser tetap bisa hilang jika pengguna menghapus data situs, memakai mode privat, kehilangan perangkat, atau browser menghapus data. Persistensi browser bukan pengganti backup. Siapa pun dengan akses ke browser yang sama bisa membaca catatan; MVP belum memiliki PIN, enkripsi, akun, atau pemulihan lewat server. Verifikasi lintas Safari/Firefox/perangkat fisik, restart sistem operasi, dan konfigurasi hosting produksi tetap diperlukan sebelum peluncuran publik.
