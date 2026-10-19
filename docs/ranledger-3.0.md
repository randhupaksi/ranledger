# Ranledger 3.0

## Cara kerja

Ranledger 3.0 mendukung ledger lokal dan ruang tersinkron. Pengguna lokal tidak mengirim data ke API akun. Login membuat sesi server, tetapi ledger lokal baru disalin setelah pengguna membuat ruang dan memilih checkbox pemindahan data. Salinan JSON diunduh sebelum pemindahan.

Frontend tetap React/TypeScript/Vite PWA. Backend memakai Hono dan PostgreSQL. Pengembangan tanpa database eksternal memakai PGlite yang persisten dalam `.cache/server-data`; mode ini tidak dipakai sebagai database produksi. Implementasi API mengacu pada [dokumentasi Hono](https://hono.dev/docs/getting-started/basic), penyimpanan pengembangan pada [PGlite](https://pglite.dev/docs/filesystems), dan hashing kata sandi pada [Node crypto](https://nodejs.org/api/crypto.html).

## Menjalankan

Gunakan Node 24 LTS. Jalankan `npm ci` lalu `npm run dev`; buka `http://localhost:5173`. Vite meneruskan `/api` ke API pada port 8787. Origin cookie dan CSRF harus sama dengan `APP_ORIGIN`. Port dev dibuat tetap agar alamat dan penyimpanan lokal tidak berpindah tanpa disengaja.

Perintah terpisah adalah `npm run dev:web`, `npm run dev:api`, dan `npm run start:api`. Salin `.env.example` ke `.env` untuk pengaturan lokal. Data pengembangan API tidak berada di browser; ia berada dalam folder PGlite yang dipilih.

Pada Vercel, frontend dan fungsi `api/[...path].ts` memakai origin yang sama. Isi `DATABASE_URL` dengan PostgreSQL persisten dan `APP_ORIGIN` dengan alamat HTTPS aplikasi. Mode lokal tetap dapat dipakai ketika API belum dikonfigurasi. Jalur deployment ini disiapkan dalam kode; provisioning database dan deployment produksi memerlukan konfigurasi pemilik proyek.

Server mandiri dapat dijalankan dari Dockerfile atau Node 24. `NODE_ENV=production` menolak fallback database memori/file; PostgreSQL wajib tersedia. `TRUST_PROXY=1` hanya dipakai jika proxy tepercaya menimpa header IP klien. API harus berada pada origin frontend yang sama atau diteruskan oleh reverse proxy. Tidak ada CORS terbuka.

## Akun dan pemulihan

Kata sandi minimal 12 karakter, disimpan dengan scrypt dan salt acak per pengguna. Cookie sesi HttpOnly, SameSite Strict, Secure pada produksi, dan berlaku 30 hari. Server menyimpan hash token sesi, bukan token mentah. Pengguna dapat mencabut perangkat lain dan keluar dari sesi aktif.

Recovery code acak hanya ditampilkan ketika akun dibuat atau dipulihkan. Recovery code disimpan sebagai hash dan dirotasi ketika dipakai. Pemulihan mencabut sesi lama. Email adalah alamat akun yang diberikan pengguna; layanan ini belum melakukan verifikasi atau pengiriman email. Undangan memakai kode akses satu kali, bukan klaim bahwa email anggota telah diverifikasi.

Permintaan mutasi memeriksa origin dan content type. Login, registrasi, dan pemulihan dibatasi berdasarkan bucket permintaan dan email. Tidak ada request log yang merekam isi transaksi, kata sandi, cookie, atau recovery code.

## Ruang dan izin

Ruang terpisah dari ledger lokal. Pemilik dapat membuat undangan editor/pembaca, mengubah peran, dan mencabut akses. Undangan berlaku 24 jam, satu kali pakai, dan memberi akses ke seluruh ledger dalam ruang tersebut. Ledger pribadi lain tidak otomatis ikut dibagikan.

Server memeriksa membership pada setiap pembacaan dan mutasi. Pembaca dapat melihat, mengekspor, dan menarik perubahan, tetapi tidak mengirim perubahan ledger. Hak akses tetap diperiksa server walaupun permintaan dibuat di luar UI. Pemilik tidak dapat mencabut dirinya sendiri sehingga ruang tidak kehilangan pemilik.

Pencabutan akses segera memblokir API. Ketika perangkat berikutnya menghubungi server dan mendapat penolakan akses, UI kembali ke ledger lokal. Salinan offline belum dienkripsi; pencabutan tidak menjanjikan penghapusan jarak jauh atas berkas pada perangkat yang sedang offline.

Penghapusan akun memerlukan kata sandi dan ketikan HAPUS AKUN. Ruang yang dimiliki, sesi, undangan, dan data server terkait dihapus. Catatan dalam ruang milik orang lain mengikuti kepemilikan ruang tersebut; aktivitas audit ruang dapat tetap memuat nama pelaku.

## Sinkronisasi dan konflik

Record finansial disimpan per ruang dan per entitas di PostgreSQL JSONB dengan revisi. Identitas, sesi, keanggotaan, undangan, dan audit memakai tabel relasional. Kolom ruang selalu menjadi bagian query otorisasi dan penyimpanan.

Perubahan browser tersimpan lokal terlebih dahulu. Baseline terakhir dan operasi yang sedang dikirim disimpan dalam IndexedDB. Pengiriman yang gagal bisa diulang memakai ID yang sama; server memeriksa ID beserta hash payload sehingga retry tidak menggandakan transaksi.

Server mengunci revisi ruang selama commit dan memvalidasi seluruh kandidat ledger sebelum menulis satu batch. Record independen dan field yang berbeda dapat digabung. Perubahan pada field yang sama atau delete-versus-edit menghasilkan konflik yang terlihat, dengan pilihan versi perangkat atau versi ruang. Waktu metadata tidak dipakai sebagai alasan untuk menghapus perubahan pengguna.

Data besar memakai chunk upload dan download yang terikat pada akun, target endpoint, dan masa berlaku. Ini menjaga ukuran tiap request/response di bawah batas body fungsi hosting. Commit finansial tetap atomik setelah seluruh potongan diterima. Chunk bukan mekanisme untuk mempublikasikan data.

Sinkronisasi dijalankan setelah perubahan dan pemeriksaan berkala saat aplikasi terbuka. Pencatatan offline tidak memerlukan tab tetap hidup karena record dan baseline disimpan. Browser perlu dibuka kembali untuk melanjutkan sinkronisasi; tidak ada janji background sync ketika browser ditutup.

Muat versi ruang merupakan penggantian cache lokal yang disengaja: pengguna mengetik MUAT, mendapat backup perangkat, lalu versi server diterapkan. Ini berguna ketika perubahan yang belum dikirim tidak lagi dapat dikirim setelah hak editor berubah menjadi pembaca. Membuka kembali ruang biasa mempertahankan perubahan lokal yang belum tersinkron.

## Aset, kewajiban, dan jurnal

Jenis akun aset adalah tunai, rekening, e-wallet, dan tabungan. Kewajiban adalah kartu kredit, PayLater, dan pinjaman/cicilan. Utang awal dimasukkan positif pada form, disimpan sebagai saldo akun negatif. Aset dikurangi kewajiban menghasilkan posisi bersih.

Pembelian kredit adalah pengeluaran dari akun kewajiban. Pembayaran dicatat sebagai transfer dari aset ke kewajiban. Pencairan pinjaman dapat dicatat sebagai transfer dari akun pinjaman ke akun aset sehingga tidak menjadi pendapatan. Refund mengembalikan dana ke akun dan mengurangi kategori pengeluaran, bukan menambah pendapatan.

Transaksi, transfer, dan saldo awal tetap menjadi sumber canonical agar migrasi v2 mempertahankan record. Tabel jurnal IndexedDB adalah proyeksi materialized yang diperbarui dalam transaksi database yang sama. Setiap jurnal memiliki posting berjumlah nol. Server merekonstruksi invariant dari sumber canonical, sehingga tidak mempercayai jurnal yang dikirim klien.

Aturan kewajiban mencakup tanggal tutup tagihan, hari jatuh tempo, jumlah pembayaran yang direncanakan, sumber dana, tanggal mulai, dan jumlah cicilan. Nol cicilan berarti berulang selama masih ada utang. Form tidak menghitung bunga kontrak; biaya dan bunga aktual dicatat pengguna sebagai beban terpisah. Tanggal 29–31 menyesuaikan akhir bulan. Cicilan dimulai pada tanggal jatuh tempo pertama yang valid setelah tanggal mulai.

## Kalender dan simulasi

Kalender memuat transaksi dan transfer bertanggal mendatang, kejadian rutin, rencana pembayaran, dan tenggat target. Pembayaran yang sudah dicatat pada bulan yang sama mengurangi rencana pembayaran bulan itu. Rencana dibatasi oleh kewajiban yang tercatat, termasuk pembelian mendatang yang diketahui.

Proyeksi 30/90 hari berawal dari saldo sampai hari ini, lalu menerapkan kejadian mendatang satu kali. Kejadian jadwal yang telah memiliki transaksi dengan occurrence key dilewati. Pembayaran utang menurunkan aset dan kewajiban. Tenggat target adalah pengingat dan tidak memindahkan saldo. Jadwal lama yang terlewat diselesaikan dari halaman transaksi rutin; kalender tidak otomatis menganggap tunggakan telah dibayar.

Grafik menampilkan saldo penutup harian, dengan maksimal satu titik per hari. Tabel agenda dipaginasi 30 baris. Simulasi berada dalam state halaman; ia tidak menjadi transaksi sampai pengguna memilih Jadikan transaksi dan mengonfirmasi kategorinya.

Laporan menampilkan pemasukan/pengeluaran beserta posisi aset/kewajiban dan arus dana aset. Beban pembelian kredit dan dana keluar saat pembayarannya dijelaskan terpisah. Telusur dampak transaksi membaca 20 jurnal terbaru melalui indeks tanggal.

## Rekonsiliasi dan aturan CSV

Pratinjau membedakan kecocokan persis, kesamaan tanggal/jenis/nominal/akun, duplikasi internal file, dan baris tidak valid. Pengguna harus memilih pencocokan; sistem tidak menghapus transaksi lama otomatis. Pencocokan ditulis sebagai metadata batch.

Aturan kategori memakai substring keterangan dan jenis transaksi. Aturan aktif pertama yang cocok mengisi kategori pratinjau. Pemetaan kolom dapat disimpan pada perangkat dan dipakai lagi jika header file sama. Aturan kategori ikut sinkronisasi; preset kolom tetap merupakan preferensi perangkat.

Batch menyimpan transaksi yang dibuat, fingerprint canonical, dan pencocokan. Undo menghapus hanya transaksi yang dibuat batch itu, mempertahankan transaksi asli yang dicocokkan, dan mencatat waktu pembatalan. Jika record batch sudah diedit/dihapus, seluruh undo ditolak agar perubahan tidak hilang.

## Migrasi dan backup

Schema IndexedDB naik secara additive ke versi 3. Record v2 tidak dihapus atau diubah isinya. Upgrade membuat jurnal dan tabel tambahan serta menyimpan salinan JSON v2 pada syncState. Salinan itu dapat diunduh di halaman Backup. Kegagalan upgrade membatalkan perubahan schema; tidak ada reset otomatis.

Backup v3 mencakup semua sumber data finansial dan preferensi lokal. Akun login, cookie, recovery code, undangan, dan sesi tidak dimasukkan dalam backup ledger. Jurnal dibangun kembali ketika restore. JSON/Excel v1/v2 tetap dibaca dan dinormalisasi ke v3.

Excel memakai DataV3 yang dipotong menjadi sel di bawah batas panjang Excel, agar metadata batch panjang tetap pulih. File `.rledger` memakai AES-GCM 256-bit, salt acak 32 byte, IV 12 byte, dan PBKDF2 SHA-256 600.000 iterasi. Frasa sandi minimal 12 karakter. File didekripsi dan dibandingkan sebelum unduhan dianggap berhasil. Frasa sandi tidak dikirim ke server.

Reset pada Pengaturan berlaku untuk ledger lokal. Ruang tersinkron dikelola melalui halaman Ruang & sinkronisasi, termasuk ekspor dan penghapusan akun. Reset lokal menghapus checkpoint sebelum upgrade juga; pengguna harus membuat backup yang ingin disimpan terlebih dahulu.

## Validasi dan batas bukti

Unit/integration test memakai fake IndexedDB dan database server sintetis. Kontrak API menguji autentikasi, role, isolasi ruang, recovery, pencabutan sesi, idempotensi, penggabungan, konflik, validasi atomik, dan transport Unicode besar. GitHub Actions menyediakan PostgreSQL 17 untuk jalur driver pg. Pengembangan lokal menguji PGlite.

Playwright menjalankan API memori pada port 8788 dan preview pada 4173. Alurnya mencakup dua perangkat, offline, konflik, ledger lokal terpisah, undangan pembaca, kredit/refund/pembayaran, proyeksi, backup terenkripsi, dan undo rekonsiliasi. Profil browser asli tidak digunakan.

Benchmark domain menulis `.cache/v3-domain-benchmarks.json` untuk 10 ribu, 50 ribu, dan 100 ribu record. Angka itu mengukur domain/jurnal/proyeksi/diff, bukan klaim performa startup perangkat fisik. Pembacaan tabel provider dipisah sehingga perubahan preferensi tidak membaca ulang semua record finansial. Operasi validasi ledger penuh masih diperlukan untuk restore dan sinkronisasi; cakupan performa interaksi pada seluruh browser perlu diukur saat beta.

TLS, sertifikat, enkripsi disk database, backup penyedia, pembatasan jaringan, monitoring layanan, dan recovery database produksi mengikuti pengaturan deployment pemilik. Tidak ada enkripsi end-to-end atau telemetry isi transaksi dalam implementasi ini. Beta pada hosting nyata dan pengujian Safari/Firefox/perangkat fisik tetap menjadi gerbang operasional sebelum rilis publik.
