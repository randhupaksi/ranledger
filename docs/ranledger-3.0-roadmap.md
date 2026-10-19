# Ranledger 3.0 — Product & Technical Roadmap

**Status:** Baseline implementasi v3; lihat [perilaku aktual dan batas operasional](ranledger-3.0.md)  
**Baseline:** Ranledger 2.0.0  
**Arah produk:** Keuangan pribadi dan rumah tangga yang dapat direncanakan, dipahami, dan digunakan lintas perangkat

## Ringkasan arah

Ranledger 2.0 sudah kuat sebagai pencatat keuangan lokal. Ranledger 3.0 perlu mengubah kemampuan inti produk: pengguna dapat mengelola aset dan kewajiban, merencanakan arus kas mendatang, bekerja lintas perangkat, dan berbagi ruang keuangan dengan orang yang mereka pilih.

Perubahan ini memerlukan model data dan arsitektur baru. V3 bukan sekadar penambahan beberapa halaman ke aplikasi sekarang.

### Janji produk

Ranledger membantu pengguna menjawab empat pertanyaan:

1. Berapa posisi keuanganku saat ini?
2. Tagihan dan pemasukan apa yang akan datang?
3. Apa dampak suatu keputusan terhadap saldo dan kewajibanku?
4. Bagaimana aku dan anggota ruang bersama mengelola keuangan tanpa kehilangan kendali atas data?

### Keputusan dasar yang direkomendasikan

- Sinkronisasi cloud **opsional dan harus diaktifkan pengguna secara sadar**.
- Mode lokal tetap tersedia dan semua fitur inti pencatatan tetap bekerja offline.
- Setiap pengguna memiliki ruang pribadi. Ruang keluarga atau pasangan adalah ruang terpisah yang dibagikan dengan undangan dan hak akses jelas.
- Angka proyeksi selalu menyebut sumber dan asumsi. Ranledger tidak menyajikan perkiraan sebagai saldo bank yang telah diverifikasi.
- Tidak ada data yang diunggah sebelum pengguna memilih membuat akun atau mengaktifkan sinkronisasi.

## Titik awal Ranledger 2.0

Ranledger 2.0 adalah PWA berbahasa Indonesia dengan React, TypeScript, Vite, Dexie/IndexedDB, validasi Zod, backup JSON/Excel, impor CSV, dan dukungan offline. Model datanya mencakup transaksi, kategori, dompet, transfer, anggaran, jadwal rutin, target, preferensi, dan revisi ledger.

Produk menyimpan seluruh data di browser. Data terikat pada origin situs dan dapat hilang ketika data situs dibersihkan atau perangkat tidak tersedia. Backup saat ini tidak dienkripsi. Model transaksi berorientasi pada satu dompet, satu jenis, satu kategori, dan satu nominal. Dompet berfungsi sebagai aset; belum ada akun kewajiban seperti kartu kredit, PayLater, atau pinjaman.

`LedgerProvider` memuat snapshot seluruh ledger dan database dapat membaca seluruh record saat operasi tertentu. Batas saat ini adalah 100.000 transaksi dan transfer. Pola tersebut menjadi risiko performa ketika ledger dan jumlah pengguna tumbuh.

V3 harus mempertahankan fondasi yang sudah terbukti: migrasi IndexedDB atomik, kompatibilitas backup lama, validasi referensi, operasi impor yang bisa dibatalkan, PWA offline, dan tampilan yang menggunakan identitas hijau Ranledger.

## Hasil produk v3

### 1. Akun dan sinkronisasi lintas perangkat

Pengguna dapat memilih salah satu cara kerja:

- **Lokal:** data tetap pada browser dan perangkat yang digunakan.
- **Tersinkron:** pengguna masuk ke akun dan ledger tersedia pada perangkat yang mereka izinkan.

Pada mode tersinkron, Ranledger tetap menerima pencatatan offline. Perubahan disimpan lokal dahulu, kemudian dikirim saat koneksi tersedia. Pengguna dapat melihat perangkat yang terhubung, waktu sinkronisasi, antrean perubahan, dan konflik yang perlu diselesaikan.

Fitur akun mencakup pemulihan akses, keluar dari perangkat tertentu, ekspor data, penghapusan akun, serta pemindahan ledger lokal v2 dengan pratinjau dan verifikasi sebelum sinkronisasi pertama.

### 2. Posisi keuangan yang mencakup aset dan kewajiban

Ranledger 3.0 mendukung:

- Dompet tunai, rekening, e-wallet, dan tabungan sebagai aset
- Kartu kredit dengan siklus tagihan, jatuh tempo, dan pembayaran
- PayLater, cicilan, dan pinjaman dengan jadwal pembayaran
- Transfer antar akun yang tidak dihitung sebagai pemasukan atau pengeluaran
- Pembayaran kewajiban tanpa mencatat pengeluaran yang sama dua kali

Untuk menjaga hitungan konsisten, transaksi yang berdampak pada beberapa akun disimpan sebagai satu jurnal dengan beberapa posting yang saling seimbang. Contohnya, pembelian kartu kredit menambah beban dan utang; pembayaran tagihan mengurangi saldo rekening dan utang tanpa membuat beban baru.

UI tetap memakai bahasa sehari-hari. Istilah jurnal dan posting adalah detail implementasi, bukan istilah yang harus dipahami pengguna.

### 3. Kalender dan perencana arus kas

Satu kalender menggabungkan transaksi mendatang, jadwal rutin, gaji yang direncanakan, tagihan, cicilan, dan target. Tampilan proyeksi mencakup 30 dan 90 hari serta saldo yang diperkirakan per akun.

Pengguna dapat membuat skenario sementara seperti pembelian besar atau perubahan pemasukan. Skenario tidak mengubah ledger sampai pengguna memilih untuk mencatat transaksi sebenarnya. Peringatan saldo rendah atau kewajiban jatuh tempo menautkan pengguna ke record yang membentuknya.

### 4. Ruang pribadi dan ruang bersama

Pengguna tersinkron dapat membuat ruang bersama untuk pasangan atau rumah tangga. Ruang bersama memiliki anggota dan peran yang eksplisit:

- **Pemilik:** mengelola ruang dan anggota
- **Editor:** mencatat dan memperbarui data yang dapat diakses ruang
- **Pembaca:** melihat data tanpa mengubahnya

Ledger pribadi tidak ikut dibagikan saat pengguna bergabung dengan ruang bersama. Setiap ruang memiliki dompet, anggaran, target, dan riwayat aktivitas sendiri. Perubahan penting menunjukkan siapa yang membuat atau memperbarui record.

### 5. Rekonsiliasi laporan dan aturan pencatatan

Impor laporan CSV membantu pengguna mencocokkan baris laporan dengan transaksi lokal, memilih pencocokan yang disarankan, dan meninjau record yang belum tercatat. Setiap impor membentuk batch yang dapat dilihat dan dibatalkan sebagai satu tindakan.

Pengguna dapat menyimpan pemetaan kolom dan aturan kategori sederhana berdasarkan keterangan transaksi. Aturan selalu terlihat dan dapat diedit; pencocokan otomatis tidak boleh diam-diam menghapus atau mengubah catatan.

Integrasi API bank tidak termasuk dalam baseline v3.0. CSV tetap menjadi jalur impor yang dapat diaudit dan digunakan offline.

## Pengalaman utama

### Navigasi

Navigasi utama mengikuti tujuan pengguna:

1. **Ringkasan:** saldo, kewajiban dekat, proyeksi, dan tindakan yang perlu diperhatikan
2. **Aktivitas:** transaksi, transfer, tagihan, dan impor
3. **Rencana:** kalender, anggaran, jadwal, skenario, dan target
4. **Akun:** dompet aset, kartu, pinjaman, dan cicilan
5. **Analisis:** posisi bersih, arus kas, evaluasi anggaran, dan rekonsiliasi periode

Pemilih ruang pribadi/bersama tampak jelas dan menunjukkan ruang aktif sebelum pengguna mencatat atau membagikan data.

### Prinsip UI/UX

- Pertahankan warna hijau, netralitas permukaan, tipografi, dan pola daftar Ranledger.
- Tampilkan tindakan utama sesuai halaman; transaksi baru tetap dapat dicatat dengan cepat.
- Utamakan tabel atau daftar untuk membandingkan transaksi, tagihan, dan akun.
- Gunakan ringkasan angka hanya bila membantu mengambil tindakan; hindari deretan kartu metrik dekoratif.
- Peringatan menjelaskan sebab, dampak, dan langkah berikutnya; warna bukan satu-satunya pembeda.
- Formulir menjelaskan apakah suatu perubahan hanya lokal, tersinkron, atau dibagikan ke ruang tertentu.
- Rancang mobile sebagai alur kerja penuh: pencatatan, persetujuan pencocokan impor, pemeriksaan proyeksi, dan penyelesaian konflik.
- Pertahankan dukungan keyboard, focus state, reduced motion, kontras, dan label aksesibel.

## Rancangan arsitektur

### Lapisan aplikasi

1. **PWA React:** navigasi, formulir, tampilan ledger, dan perilaku offline.
2. **Penyimpanan lokal Dexie:** cache ledger, antrean operasi, dan status sinkronisasi perangkat.
3. **Domain keuangan:** aturan posting seimbang, saldo, kewajiban, proyeksi, anggaran, dan rekonsiliasi. Lapisan ini tidak bergantung pada HTTP atau komponen React.
4. **API aplikasi:** autentikasi, otorisasi ruang, validasi input, idempotensi, dan pertukaran perubahan.
5. **Database server:** identitas, ruang, keanggotaan, akun, jurnal, posting, jadwal, dan audit.

Pilihan vendor autentikasi, hosting backend, dan database ditentukan setelah threat model, biaya operasional, kebutuhan pemulihan akun, dan kebutuhan privasi disepakati. Roadmap ini tidak mengunci vendor.

### Sinkronisasi

- Setiap operasi lokal yang akan disinkronkan memiliki ID idempotensi dan versi sumber.
- Pengiriman dapat diulang dengan aman setelah offline, reload, atau timeout.
- Perubahan independen digabung otomatis.
- Konflik pada field yang sama ditampilkan dengan versi dan waktu perubahan; tidak ada overwrite diam-diam.
- Sinkronisasi dibatasi ke ruang dan akun yang telah diotorisasi server.
- Log perubahan membantu audit dan pemulihan, tetapi tidak menggantikan backup yang dapat diunduh.

### Isolasi data dan perlindungan

- Semua koneksi menggunakan HTTPS; akses data dibatasi per pengguna dan per ruang pada server.
- Validasi dan otorisasi dilakukan pada server, bukan hanya disembunyikan oleh UI.
- Pengguna dapat mengekspor serta meminta penghapusan data akun dan ruang.
- Pengguna dapat mencabut sesi perangkat yang tidak dikenal.
- Kebijakan retensi backup, metadata sinkronisasi, log audit, dan penghapusan akun ditetapkan sebelum beta.
- Pilihan enkripsi end-to-end harus dibuat sebelum memilih vendor atau desain query. Enkripsi end-to-end membatasi kemampuan server membaca dan menghitung ledger, sehingga tidak boleh dijanjikan tanpa desain kunci, pemulihan, dan model berbagi ruang yang teruji.
- Backup lokal v3 mendukung enkripsi frasa sandi dengan pemeriksaan pemulihan sebelum file dianggap valid.

## Evolusi model data

Model konseptual v3:

| Entitas | Tujuan |
| --- | --- |
| User | Identitas dan preferensi akun |
| Workspace | Memisahkan ledger pribadi dan ledger bersama |
| Membership | Menghubungkan pengguna, ruang, dan peran |
| Device | Mengelola sesi sinkronisasi dan pencabutan perangkat |
| Account | Menyatukan aset dan kewajiban dalam satu model akun |
| JournalEntry | Satu peristiwa keuangan yang dapat memiliki beberapa posting |
| Posting | Dampak seimbang pada akun dan kategori |
| LiabilityTerms | Siklus tagihan, jatuh tempo, cicilan, dan kewajiban |
| Budget | Batas pengeluaran berdasarkan periode, kategori, akun, dan ruang |
| Schedule | Peristiwa rutin yang membentuk item kalender |
| ImportBatch | Sumber, pratinjau, hasil pencocokan, dan undo impor |
| SyncOperation | Operasi lokal yang belum dikonfirmasi server |
| AuditEvent | Pelaku dan perubahan pada ruang bersama |

Nama dan bentuk tabel fisik ditentukan setelah model transaksi, liability, dan izin divalidasi. Model v2 dipetakan ke model ini secara eksplisit; tidak ada konversi saldo yang diasumsikan tanpa bukti.

## Migrasi pengguna Ranledger 2.0

1. Pengguna membuat backup JSON v2 sebelum migrasi.
2. Aplikasi menguji dan menampilkan ringkasan ledger lokal yang akan dipindahkan.
3. Dompet v2 dipetakan menjadi akun aset; transaksi pemasukan/pengeluaran dan transfer dipetakan ke jurnal seimbang.
4. Anggaran, jadwal, target, kategori, preferensi, dan timestamp dipertahankan.
5. Pengguna memilih apakah ledger hanya ditingkatkan lokal atau juga disinkronkan ke akun cloud.
6. Jika cloud dipilih, pengguna melihat ruang tujuan dan cakupan data sebelum unggah pertama.
7. Setelah migrasi, aplikasi membandingkan jumlah record, saldo per akun, total pemasukan/pengeluaran, referensi, dan hasil roundtrip backup.
8. Data lokal lama tidak dihapus sampai verifikasi berhasil dan pengguna menyetujui penyelesaian.

Migrasi v1 dan v2 harus diuji memakai database sintetis, backup JSON/Excel, kegagalan di tengah proses, pembatalan, dan pemulihan. Database produksi pengguna tidak digunakan dalam pengembangan.

## Urutan milestone

### M0 — Keputusan produk dan desain risiko

- Tetapkan local-only dan sinkronisasi opt-in sebagai jalur produk.
- Tetapkan aturan pembelian kartu, pembayaran utang, cicilan, refund, transfer, dan transaksi bersama.
- Buat threat model, model izin, kebijakan penghapusan, serta keputusan enkripsi.
- Buat prototipe alur migrasi dan resolusi konflik sebelum menetapkan vendor.

**Gerbang selesai:** tidak ada aturan keuangan, privasi, atau kepemilikan ruang yang masih ambigu.

### M1 — Mesin keuangan dan model data v3

- Bangun jurnal dan posting seimbang pada domain lokal.
- Tambahkan akun aset/kewajiban dan pemetaan aturan transaksi v2.
- Siapkan versi Dexie baru, migrasi atomik, query per fitur, dan pengujian batas angka.
- Perbarui backup agar memuat model v3 dan tetap membaca v1/v2.

**Gerbang selesai:** migrasi sintetis mempertahankan seluruh total dan hubungan; saldo posting selalu seimbang.

### M2 — Akun dan sinkronisasi pribadi

- Tambahkan registrasi/login, pemulihan akses, API, dan penyimpanan server.
- Implementasikan antrean lokal, sinkronisasi idempotent, retry, indikator status, dan resolusi konflik.
- Tambahkan manajemen perangkat, export, penghapusan akun, serta aktivasi cloud yang eksplisit.

**Gerbang selesai:** dua perangkat dapat mengubah ledger yang sama secara offline/online tanpa kehilangan atau menggandakan record.

### M3 — Kewajiban dan perencana arus kas

- Tambahkan kartu, PayLater, cicilan, pinjaman, siklus tagihan, dan pembayaran.
- Bangun kalender dengan pemasukan dan kewajiban terjadwal.
- Tambahkan proyeksi saldo 30/90 hari dan skenario pembelian sementara.
- Buat peringatan yang dapat dilacak ke akun dan kejadian pembentuknya.

**Gerbang selesai:** pembelian dan pembayaran tidak menggandakan beban; proyeksi dapat direproduksi dari sumber data yang ditampilkan.

### M4 — Ruang bersama dan rekonsiliasi

- Tambahkan ruang bersama, undangan, peran, audit, dan isolasi ledger pribadi.
- Tambahkan rekonsiliasi CSV dengan matching yang dapat ditinjau, batch, pemetaan tersimpan, dan undo.
- Uji perpindahan anggota, pencabutan akses, konflik, offline, dan kepemilikan data.

**Gerbang selesai:** pengguna tidak dapat membaca atau mengubah ruang tanpa izin; impor batch dapat diverifikasi dan dibatalkan utuh.

### M5 — UX, beta, dan rilis 3.0

- Rapikan navigasi desktop/mobile berdasarkan pekerjaan pengguna.
- Tambahkan onboarding yang membedakan mode lokal dan tersinkron serta menjelaskan pemindahan data.
- Uji aksesibilitas, browser utama, kondisi offline, konflik, pemulihan backup, dan perangkat mobile.
- Jalankan beta bertahap dengan backup v2 yang dapat dipulihkan sebelum migrasi.
- Pantau error sinkronisasi, waktu operasi, crash, dan kegagalan migrasi dengan telemetry yang telah mendapat persetujuan serta tidak mengumpulkan isi transaksi.

**Gerbang selesai:** migrasi, sinkronisasi, pemulihan, dan penghapusan data teruji sebelum fitur dibuka untuk semua pengguna.

## Kriteria penerimaan v3.0

- Pengguna lokal tetap dapat membuat, melihat, mengedit, mengekspor, dan memulihkan ledger tanpa akun.
- Tidak ada data yang diunggah sebelum pengguna mengaktifkan sinkronisasi.
- Migrasi v1/v2 lolos pemeriksaan jumlah, saldo, kategori, tanggal, jadwal, target, dan transfer.
- Pembelian kartu, cicilan, transfer, dan pembayaran kewajiban menghasilkan saldo serta arus kas yang tidak dihitung ganda.
- Operasi yang dikirim berulang tidak membuat duplikasi.
- Konflik terlihat dan dapat diselesaikan; perubahan pengguna tidak hilang tanpa penjelasan.
- Isolasi ruang dan hak akses diuji di API/server, termasuk akses lintas pengguna.
- Pengguna dapat mengekspor, memulihkan, dan meminta penghapusan akun.
- Kalender dan proyeksi menjelaskan record yang dihitung dan tanggal pembaruan datanya.
- Aplikasi dapat bekerja offline dan memperlihatkan status antrean sinkronisasi.
- Pengujian beban memakai ledger 10 ribu, 50 ribu, dan 100 ribu record. Target performa ditetapkan dari baseline terukur sebelum implementasi.
- CI memeriksa lint, format, unit/integration test, migrasi, build, dan browser flow desktop/mobile.

## Risiko yang perlu dikelola

| Risiko | Pengendalian |
| --- | --- |
| Migrasi memindahkan saldo atau riwayat secara salah | Backup dahulu, migrasi sintetis, pemeriksaan saldo dan jumlah sebelum data lama dibersihkan |
| Konflik offline menimpa perubahan | ID operasi idempotent, versi per record, resolusi yang terlihat, tidak memakai last-write-wins tanpa peninjauan |
| Ruang bersama membuka data privat | Otorisasi server per ruang, audit, dan uji akses negatif lintas anggota |
| Kartu kredit dihitung sebagai beban dua kali | Jurnal seimbang dan invariant finansial untuk purchase, statement, payment, refund, dan transfer |
| Enkripsi menyulitkan pemulihan atau perhitungan | Threat model dan uji pemulihan kunci sebelum menetapkan arsitektur enkripsi |
| Sinkronisasi memperbesar biaya dan dukungan | Cloud opt-in, pembatasan/observabilitas operasi, dan keputusan biaya hosting sebelum beta |
| Banyak perubahan membuat 3.0 sulit dirilis | Gerbang milestone, beta tertutup, dan pemisahan fitur yang belum memenuhi syarat ke versi berikutnya |

## Batas baseline v3.0

- API koneksi langsung ke bank memerlukan kajian institusi, izin, dan keamanan; baseline memakai laporan CSV.
- Rekomendasi keuangan berbasis AI tidak menjadi dasar keputusan atau proyeksi. Angka harus dapat dijelaskan dari ledger dan asumsi eksplisit.
- Investasi, saham, aset kripto, multi-mata-uang, pajak, dan pelaporan regulasi tidak termasuk model dasar v3.0.
- Notifikasi push/background hanya ditambahkan setelah izin platform, privasi, dan dampaknya terhadap mode offline ditetapkan.

## Keputusan implementasi

1. Cloud bersifat opt-in dan mode local-only tetap tersedia.
2. Ruang bersama dengan peran pemilik/editor/pembaca masuk implementasi 3.0.
3. Cloud memakai HTTPS dan otorisasi server. Enkripsi end-to-end tidak dijanjikan. Enkripsi disk database ditetapkan pada deployment; backup lokal mendukung AES-GCM dengan frasa sandi.
4. Kartu kredit, PayLater, cicilan, dan pinjaman diwakili akun kewajiban beserta aturan pembayaran. Bunga/biaya kontraktual dicatat eksplisit pengguna.
5. Proyeksi 30/90 hari hanya memakai data yang dimasukkan pengguna. Perkiraan pemasukan yang tidak dicatat tidak dibuat otomatis.

API memakai Hono dengan PostgreSQL; pengembangan memakai PGlite tanpa layanan eksternal. Pemilik proyek tetap memilih penyedia PostgreSQL dan mengonfigurasi origin, TLS, backup, serta monitoring produksi sebelum beta publik.

## Catatan desain dan batas janji produk

Mode cloud memberi ketersediaan lintas perangkat, tetapi menambah tanggung jawab autentikasi, pemulihan akses, isolasi pengguna, biaya layanan, dan dukungan. Mode lokal tetap menjadi pilihan yang berguna bagi pengguna yang tidak ingin membuat akun.

Status saldo pada Ranledger tetap merupakan catatan pengguna. Proyeksi, rekonsiliasi, dan kewajiban membantu pengguna membuat keputusan, tetapi tidak mengklaim koneksi langsung atau konfirmasi dari bank.
