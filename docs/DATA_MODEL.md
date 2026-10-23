# Model Data dan Aturan Keuangan

## Ledger

`Ledger` adalah snapshot domain yang dibangun dari tabel IndexedDB. Ia berisi transaksi, kategori,
dompet, transfer, anggaran, jadwal, target, kewajiban, batch impor, aturan kategori, preferensi,
dan revisi. Definisi tipe kanonis berada di `src/domain/ledger.ts`; schema runtime berada di
`src/domain/validation.ts`.

| Entitas             | Fungsi                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| `Transaction`       | Pemasukan atau pengeluaran pada satu dompet dan kategori                |
| `Category`          | Kategori income/expense; dapat diarsip tanpa menghapus sejarah          |
| `Wallet`            | Kas, bank, e-wallet, tabungan, atau akun kewajiban dengan saldo awal    |
| `Transfer`          | Perpindahan dana antar-dompet; bukan pemasukan atau pengeluaran         |
| `Budget`            | Batas kategori per bulan, dengan cakupan dompet opsional                |
| `RecurringSchedule` | Rencana transaksi berulang dan kejadian yang sudah diproses             |
| `SavingsGoal`       | Target saldo dari dompet yang dipilih                                   |
| `LiabilityTerms`    | Detail kartu kredit, PayLater, pinjaman, atau cicilan                   |
| `ImportBatch`       | Provenance hasil impor/rekonsiliasi yang dapat ditinjau atau dibatalkan |
| `CategoryRule`      | Aturan kategori berdasarkan keterangan impor                            |
| `Preferences`       | Tema, format tanggal, dan preferensi perangkat; tidak ikut sync ruang   |

## Aturan nilai dan tanggal

- Nominal memakai rupiah integer. Pecahan, Infinity, dan nilai di luar batas aman ditolak.
- Transaksi menyimpan jenis (`income` atau `expense`) terpisah dari nilai positifnya.
- Tanggal bisnis adalah string kalender lokal `YYYY-MM-DD`, bukan instant UTC.
- Catatan, nama, dan field teks dibatasi schema sebelum disimpan atau disinkronkan.
- Maksimum gabungan transaksi dan transfer adalah 100.000; maksimum kategori adalah 1.000.

## Arus kas dan posisi

```text
saldo tercatat = saldo awal dompet + pemasukan - pengeluaran
```

Transfer mendebit sumber serta mengkredit tujuan dalam jumlah sama, sehingga tidak mengubah total
ledger. Dompet kewajiban menyimpan posisi negatif. `finance.ts` membentuk jurnal berimbang dari
saldo awal, transaksi, dan transfer; `forecast.ts` menambahkan jadwal, tagihan, serta tenggat
untuk proyeksi tanpa menulis transaksi simulasi.

Pembelian dengan kredit adalah pengeluaran. Pembayaran tagihan bergerak sebagai transfer menuju
dompet kewajiban sehingga beban tidak dihitung dua kali. Refund memakai transaksi expense berflag
refund dan mengurangi beban kategori.

## Integritas referensi

`validateLedger` memastikan ID, jenis kategori, dompet sumber/tujuan, kategori, target, aturan,
dan angka konsisten. Implikasi praktisnya:

- jangan menghapus entitas yang masih direferensikan tanpa strategi migrasi yang eksplisit;
- lakukan import, restore, dan sync dalam transaksi;
- setelah perubahan massal, baca ulang hasil penyimpanan sebelum menyatakan sukses;
- kesalahan validasi harus membatalkan seluruh operasi, bukan menyisakan ledger separuh berubah.

## Model sinkronisasi

Untuk cloud, ledger diproyeksikan menjadi map record ber-ID dengan key `entity/id`. Mutation
membawa `before` dan `after`; nilai `null` adalah tombstone. Server menggabungkan mutation dengan
record canonical dan baru menaikkan revisi bila ada perubahan nyata.

Konflik bukan keberhasilan sinkronisasi. Klien menyimpan state konflik dan pengguna memilih hasil
yang benar. Preferensi UI perangkat tidak disinkronkan agar pilihan tampilan satu perangkat tidak
mengubah perangkat lain.

## Backup dan pemulihan

- JSON adalah cadangan utama yang mudah diperiksa tetapi tidak terenkripsi.
- Excel backup harus mempertahankan struktur workbook Ranledger; file Excel umum masuk melalui impor CSV.
- `.rledger` mengenkripsi backup menggunakan frasa sandi; frasa tidak dapat dipulihkan aplikasi.
- `Gabung` mempertahankan versi lokal bila ID bertabrakan. `Ganti` membutuhkan pratinjau dan konfirmasi teks.
- Versi v1 dan v2 tetap didukung oleh normalisasi/migrasi di layer data; jangan menghapus compatibility
  path tanpa kebijakan migrasi yang terpisah.
