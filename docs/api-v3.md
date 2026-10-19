# Ranledger API v3

Semua endpoint berada di `/api`, mengembalikan JSON, dan memakai `Cache-Control: no-store`. Endpoint akun/ruang membutuhkan cookie sesi HttpOnly. Mutasi membutuhkan Origin yang tepat dan Content-Type application/json. Nilai uang adalah IDR integer dan tanggal keuangan adalah YYYY-MM-DD.

## Endpoint

| Method | Path | Akses dan tujuan |
| --- | --- | --- |
| GET | /health | Status aplikasi tanpa data akun |
| POST | /auth/register | Email, name, password, device opsional; membuat sesi dan mengembalikan recoveryCode satu kali |
| POST | /auth/login | Email, password, device opsional; membuat sesi |
| POST | /auth/recover | Email, recoveryCode, password baru, device opsional; rotasi kode dan pencabutan sesi lama |
| GET | /auth/me | Identitas sesi aktif |
| POST | /auth/logout | Menghapus sesi aktif |
| GET | /auth/devices | Sesi milik pengguna, tanpa raw token |
| DELETE | /auth/devices/:id | Mencabut sesi milik pengguna |
| GET | /auth/export | Identitas dan ledger seluruh ruang yang dapat diakses |
| DELETE | /auth/account | Kata sandi; menghapus akun dan ruang yang dimiliki |
| GET | /spaces | Daftar ruang milik/diikuti pengguna |
| POST | /spaces | Nama ruang; membuat ruang kosong dengan pemilik |
| GET | /spaces/:id/sync?cursor=0 | Delta record dan tombstone sejak revisi; semua anggota |
| POST | /spaces/:id/sync | Batch mutation; owner/editor, pembaca hanya untuk pull tanpa perubahan |
| GET | /spaces/:id/members | Anggota ruang |
| POST | /spaces/:id/invites | Owner; role editor/viewer, kode satu kali 24 jam |
| POST | /spaces/join | Code; mengonsumsi undangan dan menambahkan membership |
| PATCH | /spaces/:id/members/:user | Owner; role editor/viewer untuk anggota selain owner |
| DELETE | /spaces/:id/members/:user | Owner mencabut anggota selain owner; anggota dapat keluar dari ruang |
| GET | /spaces/:id/audit | 100 aktivitas terakhir ruang, tanpa isi record |
| POST | /transport/upload | Potongan request sync milik pengguna dan ruang yang diizinkan |
| GET | /transport/download/:id/:part | Potongan response sementara yang terikat ke pengguna |

## Sinkronisasi

Payload POST sync terdiri dari id UUID, cursor revisi terakhir, dan changes. Setiap change berisi entity, id, before, dan after. Before/after adalah record lengkap atau null untuk pembuatan/penghapusan. Entitas yang diperbolehkan: transactions, categories, wallets, transfers, budgets, schedules, goals, liabilities, importBatches, rules.

Server memvalidasi schema setiap record, kesesuaian ID, izin ruang, konflik, serta invariant gabungan ledger. Commit satu batch atomik dan mempunyai hash payload idempotensi. ID yang sama dengan isi berbeda ditolak. Preferensi tampilan perangkat tidak disinkronkan.

Respons berhasil memuat revision, role, dan changes berisi key, value, version. Value null berarti tombstone. Cursor nol meminta snapshot sumber canonical lengkap. Pengiriman tanpa perubahan tidak menaikkan revisi ruang.

HTTP 409 untuk konflik memuat conflicts, records server, revision, dan role. Setiap konflik memuat before, after perangkat, dan remote. Klien mempertahankan versi lokal sampai pengguna memilih. Pelanggaran invariant atau referensi mengembalikan 422 tanpa penulisan parsial.

## Transport data besar

Jika request sync lebih dari satu juta unit string, klien mengunggah potongan maksimal 500.000 melalui /transport/upload dengan id upload UUID, index, count, target path, dan data. Commit dikirim ke endpoint sync dengan X-Ranledger-Upload dan body kosong. Server memeriksa user, target, masa berlaku, urutan, dan kelengkapan sebelum parse dan validasi ledger.

Respons JSON besar diganti envelope transport berisi id dan parts. Klien meminta potongan secara berurutan lalu memulihkan JSON, termasuk untuk error konflik. Token download hanya berlaku untuk akun yang membuat permintaan dan mempunyai masa akses 10 menit. Potongan upload memiliki masa akses 15 menit. Record kedaluwarsa dibersihkan saat pemrosesan transport berikutnya; jadwal pembersihan fisik tambahan dapat ditetapkan pada hosting produksi.

## Error

Error normal berbentuk `{ "error": "pesan" }`. Status yang digunakan adalah 401 untuk sesi tidak valid, 403 untuk origin/izin, 404 untuk undangan/download yang tidak tersedia, 409 untuk konflik atau ID operasi, 413 untuk ukuran, 422 untuk validasi, 429 untuk batas percobaan, dan 500/503 untuk layanan yang belum tersedia. Detail database, password hash, recovery hash, raw token, dan connection string tidak dikirim ke klien.
