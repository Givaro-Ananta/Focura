# Focura — Ruang Fokus

Aplikasi Next.js untuk layanan bimbingan dan konseling dengan login Google, daftar email di Google Sheets, dan dashboard sesuai peran. Rencana pengembangan ada di [BLUEPRINT.md](./BLUEPRINT.md).

## Mencoba akun demo

Setelah memasang dependensi dengan `npm ci`, jalankan `npm run demo`. Buka `http://127.0.0.1:3001` dan klik **Masuk sebagai Admin Demo**. Akun `admin@focura.test` memiliki akses Admin Central ke dua sekolah contoh. Perubahan data demo disimpan sementara di memori dan direset saat server dimulai ulang.

Admin Central membuka **Ringkasan** di `/admin`. Gunakan menu samping untuk direktori Guru BK dan Siswa, pengelolaan sekolah dan kelas, akun, tautan wali, dan panduan RPL. Filter siswa dan ekspor Excel tersedia di halaman Siswa.

## Menjalankan secara lokal

Gunakan Node.js 22.9 atau lebih baru. Pasang dependensi dengan `npm ci`, lalu salin `.env.example` ke `.env.local` dan isi konfigurasi berikut.

| Konfigurasi | Nilai |
| --- | --- |
| `NEXTAUTH_URL` | URL aplikasi, misalnya `http://localhost:3000` untuk pengembangan. |
| `NEXTAUTH_SECRET` | Rahasia acak yang hanya tersedia di server. Buat dengan `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Kredensial OAuth Web Client. Daftarkan `http://localhost:3000/api/auth/callback/google` sebagai redirect URI untuk pengembangan, dan callback HTTPS yang setara untuk host produksi. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Email dan private key service account dari proyek dengan Google Sheets API aktif. Simpan private key dalam nilai yang dikutip. Tanda baris baru yang ditulis sebagai `\n` juga didukung. |
| `GOOGLE_ALLOWLIST_SPREADSHEET_ID` | ID Google Sheets privat untuk daftar izin. Buat tab `Email` dengan header `email` di sel A1. Bagikan dengan akses Viewer ke service account dan Editor ke Master Admin. |
| `GOOGLE_DATA_SPREADSHEET_ID` | ID spreadsheet operasional yang berbeda. Bagikan dengan akses Editor ke service account. |
| `FOCURA_MASTER_EMAIL` | Email Google Master Admin pertama. Masukkan juga email ini ke tab `Email`. |

Jalankan `npm run setup:sheets` sekali untuk menyiapkan tab operasional, lalu jalankan `npm run dev`. Buka `http://localhost:3000`, masuk sebagai Master Admin, tambahkan sekolah dan kelas, lalu atur profil untuk email yang sudah terdaftar. Email lain masuk setelah Master Admin menambahkan emailnya ke spreadsheet dan menetapkan perannya di Focura. Jika OAuth masih berstatus Testing, tambahkan akun pengujian di pengaturan Google OAuth.

Spreadsheet operasional dikelola aplikasi. Untuk tahap awal, jalankan satu proses Next.js agar perubahan yang bergantung pada data dari Sheets diproses secara berurutan. Deployment dengan beberapa proses memerlukan koordinasi penulisan bersama. Focura memeriksa daftar email, izin akun, dan sesi saat data terlindungi diminta.

Impor Excel membaca tab `Atur_Tugas` dan menyimpan hasilnya ke akun siswa. Batas tahap awal adalah 500 tugas per impor. File asli tetap di perangkat pengguna. Data lama dari penyimpanan browser belum dipindahkan otomatis.

## Verifikasi

- `npm test` menjalankan pengujian otorisasi, sesi lintas perangkat, tautan wali, dan keanggotaan kelas dengan penyimpanan uji.
- `npm run build` membuat build produksi.
- `npm start` menjalankan build produksi secara lokal.
