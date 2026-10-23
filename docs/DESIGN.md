# Panduan Desain Ranledger

## Karakter produk

Ranledger adalah alat kerja pribadi untuk membaca kondisi uang dan bertindak dengan hati-hati.
Tampilannya tenang, padat secukupnya, dan mudah dipindai. Hierarki datang dari ruang, border,
tipografi, dan warna yang bermakna—bukan dari gradient dekoratif atau kartu berbayang berat.

Referensi rasa: ledger yang rapi dan modern, dengan fokus pada angka, status, dan keputusan
pengguna. Hindari mengubahnya menjadi dashboard SaaS yang ramai atau aplikasi finansial yang
mengandalkan warna untuk satu-satunya penanda makna.

## Sumber kebenaran

- `src/styles/style.css`: token dasar, shell, komponen, responsivitas, dan reduced motion.
- `src/styles/style-v2.css`, `style-v3.css`, `style-personality.css`: aturan versi/fitur yang
  tetap diimpor berurutan dari `src/main.tsx`.
- `src/components/ui.tsx`: page heading, empty/error state, filter periode, dan pola tampilan bersama.
- `src/components/Modal.tsx`, `SelectField.tsx`, `DatePicker.tsx`: primitive interaktif aksesibel.

Jaga urutan impor stylesheet. Aturan yang muncul kemudian dapat sengaja menyempurnakan aturan
sebelumnya.

## Token dan semantik

Token CSS didefinisikan di `:root` dan memiliki pasangan dark theme di
`:root[data-theme="dark"]`.

| Kebutuhan        | Token utama                                                 |
| ---------------- | ----------------------------------------------------------- |
| Kanvas dan panel | `--paper`, `--surface`, `--surface-alt`, `--surface-raised` |
| Teks dan pemisah | `--ink`, `--muted`, `--line`                                |
| Aksi utama       | `--brand`, `--brand-hover`, `--on-brand`, `--brand-soft`    |
| Nilai uang       | `--income`, `--expense`, dan pasangan `*-soft`              |
| Status risiko    | `--danger`, `--warning`, dan pasangan `*-soft`              |
| Navigasi/focus   | `--sidebar`, `--sidebar-muted`, `--focus-ring`              |

Gunakan token semantik yang ada. Nilai mentah baru hanya boleh masuk ke fondasi token bila sebuah
peran visual baru benar-benar diperlukan. Jangan memakai hijau untuk setiap elemen; di Ranledger
hijau terutama berarti brand, pemasukan, atau keadaan positif.

## Komposisi

- Desktop memakai sidebar tetap dan area konten utama yang lega.
- Mobile memakai navigasi bawah; jangan menyembunyikan aksi yang penting hanya untuk menjaga layout.
- Header halaman menampilkan eyebrow opsional, judul, deskripsi singkat, lalu aksi yang relevan.
- Ringkasan finansial memprioritaskan angka utuh, `tabular-nums`, label jelas, dan konteks periode.
- Tabel/list menempatkan nilai nominal dengan konsisten, mendukung overflow teks, serta menawarkan
  empty state atau filter reset yang berguna.
- Modal memakai Base UI untuk focus trap dan Escape. Jangan mengganti dengan panel buatan sendiri
  yang menghilangkan perilaku keyboard.

## Interaksi dan state

Setiap halaman atau flow yang relevan harus menangani loading, kosong, error, disabled, dan sukses.
Status jaringan tidak boleh membuat ledger lokal seolah-olah hilang. Tindakan destruktif atau
berdampak besar—hapus, reset, replace backup, revoke akses—harus menjelaskan akibatnya dan meminta
konfirmasi yang sepadan.

Pemberitahuan PWA tidak boleh memaksa refresh ketika form atau dialog sedang aktif. Motion hanya
boleh menjadi umpan balik singkat; style reduced-motion global harus tetap berlaku.

## Aksesibilitas dan responsif

- Gunakan elemen asli untuk tombol, input, link, dan fieldset.
- Fokus keyboard harus selalu terlihat melalui `--focus-ring`.
- Icon-only control harus memiliki `aria-label`.
- Angka, warna pemasukan/pengeluaran, dan status harus memiliki label atau konteks teks; jangan
  menjadikan warna satu-satunya sinyal.
- Layout harus berfungsi dari lebar minimum 320px sampai desktop lebar, tanpa overflow horizontal.
- Pertahankan label form, validasi yang dapat dibaca, target sentuh yang praktis, dan safe area mobile.
