# Focura — Ruang Fokus

Aplikasi Next.js untuk layanan bimbingan dan konseling SMA. Focura membantu siswa melatih fokus dan mencatat progres belajar. Guru BK, Admin Central, dan orang tua/wali memiliki ruang kerja sesuai perannya.

## Login demo

Contoh ini menggunakan Node.js 24 dan npm. Dari folder proyek, jalankan kedua perintah berikut.

```sh
npm ci
npm run demo
```

1. Buka [http://127.0.0.1:3001](http://127.0.0.1:3001) setelah server siap.
2. Klik **Masuk sebagai Admin Demo** untuk masuk dengan akun bawaan `admin@focura.test`. Focura akan membuka **Ringkasan** di `/admin`.
3. Buka **Akun** untuk mencoba **Tambah akun** dan filter **Peran** serta **Status akun**. Buka **Siswa** untuk memfilter siswa berdasarkan sekolah dan kelas atau mengekspor rekap Excel.

Demo memuat dua sekolah contoh. Semua perubahan tersimpan di memori dan dihapus saat server dimulai ulang. Gunakan `Ctrl+C` di terminal untuk menghentikan demo.

## Fitur yang tersedia

| Peran | Fitur |
| --- | --- |
| Admin Central | Melihat jumlah Guru BK dan siswa yang sedang login, mengelola sekolah dan kelas, menambah akun Guru BK dan siswa, meninjau pendaftaran, dan menautkan wali ke siswa. Direktori siswa menyediakan filter sekolah dan kelas serta ekspor Excel. |
| Guru BK | Melihat daftar siswa di sekolah penugasannya, status sesi, ringkasan progres belajar, dan panduan Rencana Pelaksanaan Layanan (RPL). Guru BK juga dapat mengekspor rekap siswa ke Excel. |
| Siswa | Membaca modul Google Drive, mengenali hambatan belajar, mengatur tugas dan target, menggunakan timer fokus 10, 25, atau 50 menit, menulis refleksi, melihat progres, mengimpor dan mengekspor Excel, serta membuka formulir konsultasi Guru BK dan dokumen RPL. |
| Orang tua/wali | Melihat nama, sekolah, dan kelas anak yang ditautkan oleh Admin Central. |

## Menjalankan dengan Google OAuth dan Google Sheets

Pasang dependensi dengan `npm ci`. Salin `.env.example` ke `.env.local`, lalu isi konfigurasi berikut.

| Konfigurasi | Nilai |
| --- | --- |
| `NEXTAUTH_URL` | URL aplikasi, misalnya `http://localhost:3000` untuk pengembangan. |
| `NEXTAUTH_SECRET` | Rahasia acak yang hanya tersedia di server. Buat dengan `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Kredensial OAuth Web Client. Daftarkan `http://localhost:3000/api/auth/callback/google` sebagai redirect URI untuk pengembangan, dan callback HTTPS yang setara untuk host produksi. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Email dan private key service account dari proyek dengan Google Sheets API aktif. Simpan private key dalam nilai yang dikutip. Tanda baris baru yang ditulis sebagai `\n` juga didukung. |
| `GOOGLE_ALLOWLIST_SPREADSHEET_ID` | ID Google Sheets privat untuk daftar izin. Buat tab `Email` dengan header `email` di sel A1. Berikan akses Editor kepada service account agar Focura dapat menambahkan email dari menu Akun. |
| `GOOGLE_DATA_SPREADSHEET_ID` | ID spreadsheet operasional yang berbeda. Bagikan dengan akses Editor ke service account. |
| `FOCURA_MASTER_EMAIL` | Email Google Master Admin pertama. Masukkan juga email ini ke tab `Email`. |

Jalankan `npm run setup:sheets` sekali untuk menyiapkan tab operasional. Setelah itu, jalankan `npm run dev`, buka [http://localhost:3000](http://localhost:3000), lalu pilih **Masuk dengan Google** menggunakan email Master Admin. Tambahkan sekolah dan kelas dari menu **Sekolah & Kelas**. Jika aplikasi OAuth masih berstatus **Testing**, tambahkan akun pengujian di pengaturan Google OAuth.

### Pendaftaran dan pengelolaan akun

- Admin Central dapat membuka **Akun → Tambah akun** untuk Guru BK dan siswa. Focura menambahkan email ke tab `Email` dan menyimpan profil di tab `Akun` pada spreadsheet operasional.
- Guru BK dapat memilih **Daftar sebagai Guru BK** dan memverifikasi akun Google. Pendaftaran muncul di menu **Akun** dengan status **Menunggu persetujuan**. Admin memilih sekolah dan menyetujui pendaftaran untuk menambahkan email ke daftar izin dan membuka akses.
- Gunakan filter **Peran** dan **Status akun** secara bersamaan untuk menemukan akun yang perlu ditinjau, misalnya Guru BK yang menunggu persetujuan.
- Untuk peran lain, tambahkan email ke tab `Email` lalu buat profil dari menu **Akun**. Jika penyimpanan akun terhenti setelah email ditambahkan, muat ulang menu **Akun** dan lanjutkan dari **Buat profil** atau **Tinjau pendaftaran**.

Spreadsheet operasional dikelola aplikasi. Untuk tahap awal, jalankan satu proses Next.js agar perubahan yang bergantung pada data dari Sheets diproses secara berurutan. Deployment dengan beberapa proses memerlukan koordinasi penulisan bersama. Focura memeriksa daftar email, izin akun, dan sesi saat data terlindungi diminta.

Impor Excel membaca tab `Atur_Tugas` dan menyimpan hingga 500 tugas per impor ke akun siswa. File asli tetap di perangkat pengguna. Data lama dari penyimpanan browser belum dipindahkan otomatis.

## Verifikasi

- `npm test` menjalankan pengujian otorisasi, pendaftaran dan persetujuan Guru BK, sinkronisasi akun, sesi, tautan wali, dan keanggotaan kelas dengan penyimpanan uji.
- `npm run build` membuat build produksi.
- `npm start` menjalankan build produksi secara lokal.
