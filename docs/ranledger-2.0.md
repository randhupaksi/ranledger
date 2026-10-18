# Ranledger 2.0

Ranledger menghubungkan pencatatan, beberapa dompet, anggaran bulanan, transaksi rutin, dan target tabungan. Semua data tetap berada di browser pada origin yang sama. Tidak ada akun, backend, analytics, atau sinkronisasi otomatis.

## Dompet dan saldo

- Dompet berjenis tunai, rekening bank, e-wallet, atau tabungan. Jenis adalah label pengelompokan dan tidak terhubung ke layanan bank.
- Saldo dompet = saldo awal + pemasukan − pengeluaran + transfer masuk − transfer keluar.
- Saldo gabungan mencakup dompet aktif dan arsip. Transfer tidak mengubah saldo gabungan atau angka pemasukan/pengeluaran.
- Saldo boleh negatif. Tidak ada pemeriksaan saldo bank asli atau pembatasan pengeluaran berdasarkan saldo tercatat.
- Saldo awal boleh negatif, maksimal ±Rp1 triliun per dompet. Mengubah saldo awal tidak membuat pemasukan baru.
- Transfer disimpan sebagai satu record atomik dengan dua referensi dompet. Biaya transfer dicatat sebagai pengeluaran terpisah.
- Dompet diarsipkan, bukan dihapus, agar riwayat tetap utuh. Minimal satu dompet harus aktif. Jadwal aktif harus dijeda sebelum dompetnya diarsipkan.
- Total transaksi dan transfer maksimal 100.000 record; total hitung tetap harus berada dalam rentang integer aman JavaScript. Setiap kelompok dompet, anggaran, jadwal, dan target maksimal 1.000 record.

## Anggaran

Satu anggaran berlaku untuk satu kategori pengeluaran, satu bulan kalender lokal, dan satu cakupan dompet. Cakupan bisa satu dompet atau seluruh dompet. Kombinasi bulan/kategori/cakupan tidak boleh ganda.

Pemakaian mencakup seluruh transaksi bertanggal dalam bulan tersebut, termasuk tanggal mendatang. Transfer dan saldo awal tidak memakai anggaran. Status mendekati batas dimulai pada 80%; mencapai batas dimulai pada 100%. Anggaran tidak menghentikan pencatatan.

Anggaran tidak otomatis dibawa ke bulan selanjutnya. Riwayat bulan lama tetap dapat dilihat dan diubah. Anggaran global dan anggaran per dompet dapat saling tumpang tindih, sehingga aplikasi tidak menjumlahkannya menjadi satu total anggaran yang menyesatkan.

## Transaksi rutin

Jadwal mendukung mingguan, bulanan, dan tahunan; tanggal akhir bersifat opsional. Pengingat tampil ketika aplikasi dibuka. Tidak ada pembuatan transaksi otomatis di latar belakang atau notifikasi sistem.

- **Catat:** setelah konfirmasi, transaksi memakai tanggal jatuh tempo dan informasi jadwal. Jadwal maju satu kejadian dalam transaksi IndexedDB yang sama.
- **Lewati:** tidak membuat transaksi, lalu maju satu kejadian setelah konfirmasi.
- Jadwal terlewat diselesaikan satu per satu. Jadwal bisa dijeda, diubah, atau dihapus. Transaksi yang sudah dicatat tetap ada jika jadwal dihapus.
- Tanggal 29–31 memakai tanggal terakhir bulan yang lebih pendek, kemudian kembali ke tanggal jangkar pada bulan berikutnya. Jadwal tahunan 29 Februari kembali ke tanggal tersebut pada tahun kabisat.
- Setiap kejadian memiliki kunci unik. Konfirmasi dari tab dengan data lama ditolak; data terbaru tidak ditimpa.
- Mengubah tanggal berikutnya atau frekuensi menetapkan jangkar baru. Mengubah nama atau nominal mempertahankan jangkar lama.

## Target tabungan

Target berisi nama, jumlah tujuan, tanggal target, dan dompet yang dihubungkan. Satu dompet hanya bisa terhubung ke satu target aktif. Gunakan dompet khusus untuk setiap tujuan.

Progres = saldo dompet, dengan nilai tampilan minimal nol. Saldo awal dan transfer masuk menaikkan progres; pengeluaran dan transfer keluar menurunkannya. Target tidak menyimpan kontribusi tambahan dan tidak membuat pemasukan/pengeluaran baru. Mengarsipkan atau menghapus target tidak mengubah saldo dompet.

## CSV

CSV adalah impor transaksi, bukan pengganti backup lengkap. Maksimal 16 MB, 100.000 baris data, dan 100 kolom. Baris pertama harus memuat nama kolom yang unik. Pemisah koma, titik koma, dan tab didukung, termasuk kutip ganda dan catatan beberapa baris.

Pengguna memilih format tanggal (YYYY-MM-DD, DD/MM/YYYY, atau MM/DD/YYYY) dan angka (Indonesia, internasional, atau integer polos). Tanggal ambigu tidak ditebak. Pecahan rupiah selain nol ditolak tanpa pembulatan.

Jenis transaksi dapat berasal dari pilihan pemasukan/pengeluaran untuk seluruh file, tanda nominal, kolom jenis, atau kolom debit/kredit terpisah. Pada mode nominal bertanda, negatif berarti pengeluaran. Debit/kredit harus positif dan hanya salah satu terisi pada tiap baris.

Kategori dicocokkan berdasarkan nama dan jenis. Nama yang tidak dikenal memakai kategori default pilihan pengguna. Kategori tiap baris dapat diubah di pratinjau. Seluruh transaksi masuk ke satu dompet aktif pilihan pengguna.

Kemungkinan duplikat dibandingkan dengan transaksi lokal dan baris sebelumnya dalam file, memakai tanggal, jenis, nominal, dompet, serta catatan yang dinormalisasi. Ini hanya petunjuk: pengguna bisa memilihnya dengan sengaja. Baris duplikat dan tidak valid tidak dipilih otomatis. Baris tidak valid harus diperbaiki di sumber file atau dibiarkan tidak diimpor. Konfirmasi menampilkan jumlah pilihan dan baris yang dikecualikan.

Parsing dan penyusunan pratinjau berjalan di Web Worker. Daftar pratinjau dipaginasi 30 baris. Sebelum menyimpan, revisi ledger diperiksa kembali; penulisan semua baris terpilih berlangsung atomik. Kegagalan membatalkan seluruh impor.

## Migrasi dari versi 1

Kode memuat migrasi Dexie dari schema 1 ke 2. Migrasi dijalankan browser ketika versi baru dibuka, bukan oleh perintah deploy atau proses server.

1. Buat dompet **Utama** dengan ID tetap `main-wallet`.
2. Pindahkan saldo awal lama dari preferensi ke dompet tersebut.
3. Tambahkan referensi dompet pada seluruh transaksi lama tanpa mengubah ID, tanggal, jenis, kategori, nominal, catatan, atau timestamp.
4. Tambahkan tabel transfer, anggaran, jadwal, dan target yang kosong.
5. Pertahankan preferensi lainnya dan naikkan revisi ledger.

Migrasi menggunakan transaksi upgrade IndexedDB. Kegagalan membatalkan schema dan perubahan data; tidak ada reset otomatis. Pengujian migrasi menggunakan database sintetis terisolasi. Data browser pribadi tidak digunakan saat implementasi.

Sebelum pengguna produksi memasang upgrade, anjurkan backup JSON v1 di perangkat lama. Browser dengan tab versi lama perlu memuat ulang setelah versi baru membuka database. Jangan menurunkan aplikasi kembali ke schema v1 setelah pengguna membuat data 2.0; gunakan backup sebelum upgrade pada aplikasi v1 terpisah jika perlu pemulihan versi lama. Backup tersebut tidak memuat data baru 2.0.

## Backup v2

JSON dan Excel mencakup seluruh kelompok data. Excel mempunyai lembar Ranledger, Transaksi, Kategori, Pengaturan, Dompet, Transfer, Anggaran, Jadwal, dan Tujuan. Impor JSON/Excel v1 tetap didukung dan dipetakan ke dompet Utama. Aplikasi v1 tidak dapat membaca backup v2.

**Ganti** memulihkan seluruh isi file setelah pratinjau dan ketikan `GANTI`. **Gabung** menjaga versi lokal untuk ID yang sudah ada. Kategori baru dengan nama/jenis sama diarahkan ke kategori lokal. Dompet dengan ID atau nama sama memakai versi lokal, termasuk saldo awalnya; dompet baru membawa saldo awal dari backup. Anggaran dengan kombinasi sama dan target aktif pada dompet yang sama memakai versi lokal. Kunci kejadian jadwal mencegah impor transaksi rutin yang sama dua kali.

Pratinjau menampilkan jumlah data baru setiap kelompok dan saldo hasil. Semua referensi dan jumlah diperiksa sebelum menulis, lalu hasil dibaca dan dibandingkan sebelum sukses diumumkan. Backup tidak dienkripsi.

## UI dan navigasi

Identitas hijau, tipografi sistem, scrollbar hijau, tema terang/gelap, dan dropdown Radix tetap digunakan. Hierarki baru memakai daftar dengan pemisah, progres anggaran/tabungan, ringkasan dompet, serta antrean jadwal yang membutuhkan tindakan.

Desktop memakai navigasi samping. Mobile menyediakan Beranda, Transaksi, Anggaran, Rencana, dan Lainnya. Menu Lainnya membuka dompet, laporan, impor, backup, serta pengaturan. Semua halaman fitur dan dialog dimuat sesuai kebutuhan; modul CSV worker dan Excel ikut tersedia offline pada build produksi.

## Pemeriksaan rilis

Jalankan typecheck, lint, format check, unit test, build, dan browser test. Cakupan khusus v2 mencakup migrasi/rollback v1, backup JSON/Excel kedua versi, invariansi transfer, anggaran lintas bulan/dompet, jadwal akhir bulan/tahun kabisat, konflik antar-tab, target ganda, CSV invalid/duplikat/atomik, pekerja CSV offline, serta navigasi dan overflow mobile.

Pemeriksaan di browser lokal Chromium/Edge tidak menggantikan pemeriksaan Safari, Firefox, perangkat fisik, atau deployment Vercel produksi.
