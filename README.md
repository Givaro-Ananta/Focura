# Focura — Ruang Fokus (Modular Web Assets)

Paket aset website interaktif **Focura (Ruang Fokus)** sebagai media Bimbingan dan Konseling (BK) bidang belajar jenjang SMA.

## Struktur Direktori Modular

- `index.html` — Halaman utama aplikasi (Autentikasi Landscape, Dashboard Siswa, & Ruang Admin Guru BK).
- `css/style.css` — Stylesheet terpisah dengan desain responsif, ramah layar ponsel maupun desktop.
- `js/config.js` — Konfigurasi tautan Google Form Konsultasi, 3 Modul Google Drive, kredensial Admin Guru BK, dan dokumen RPL Bimbingan Klasikal.
- `js/auth.js` — Modul autentikasi siswa (wajib buat akun terlebih dahulu) dan pemisahan ruang akses Admin Guru BK (`mltihrnnda@gmail.com`).
- `js/storage.js` — Modul penyimpanan data terisolasi 100% per ID akun siswa.
- `js/excel-sync.js` — Modul ekspor & impor workbook Spreadsheet Excel (`.xlsx`) multi-sheet.
- `js/app.js` — Pengendali utama antarmuka, timer latihan fokus, checklist hambatan belajar, refleksi, dan grafik progres.
- `assets/svg/` — Aset vektor logo (`logo-focura.svg`) dan ilustrasi belajar (`student-focus.svg`).

## Cara Menjalankan Secara Lokal

Karena menggunakan ES Modules (`type="module"`), jalankan melalui server lokal (misalnya ekstensi **Live Server** di VS Code atau `python -m http.server 8000`) lalu buka `http://localhost:8000`.
