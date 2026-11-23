# Focura — Ruang Fokus

Aplikasi Next.js untuk layanan bimbingan dan konseling SMA. Focura membantu siswa melatih fokus dan mencatat progres belajar. Guru BK, Admin Central, dan orang tua/wali memiliki ruang kerja sesuai perannya.

## Login demo

Contoh ini menggunakan Node.js 24 dan npm. Dari folder proyek, jalankan kedua perintah berikut.

```sh
npm ci
npm run demo
```

1. Buka [http://127.0.0.1:3001](http://127.0.0.1:3001) setelah server siap.
2. Pilih akun demo di halaman masuk. **Admin Central** membuka **Ringkasan**, **Guru BK** membuka **Beranda Konselor**, dan **Siswa** membuka ruang pribadi.
3. Pilih siswa Bandar Lampung untuk menguji tugas, fokus, refleksi, dan materi yang dikelola Guru BK demo. Siswa Talang Padang dapat dipakai untuk memeriksa pembatasan materi lintas sekolah.

Demo memuat dua sekolah contoh. Semua perubahan tersimpan di memori dan dihapus saat server dimulai ulang. Gunakan `Ctrl+C` di terminal untuk menghentikan demo.

## Fitur yang tersedia

| Peran | Fitur |
| --- | --- |
| Admin Central | Melihat jumlah Guru BK dan siswa yang sedang login, mengelola sekolah dan kelas, menambah akun Guru BK dan siswa, meninjau pendaftaran, dan menautkan wali ke siswa. Direktori siswa menyediakan filter sekolah dan kelas serta ekspor Excel. |
| Guru BK | Melihat ringkasan sekolah dan mencari atau memfilter peserta didik. Guru BK dapat memantau angket awal dan hambatan secara terpisah, mengelola materi untuk sekolahnya, mencetak RPL, mengimpor angket, serta mengekspor rekap Excel. |
| Siswa | Membuka materi sekolah, menyimpan pemetaan hambatan, mengelola tugas, menggunakan timer dengan target belajar, mencatat refleksi privat, melihat progres, mengimpor tugas, mengekspor Excel, membuka formulir konsultasi, dan membaca atau mencetak RPL. |
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
| `FOCURA_OAUTH_TESTING` | Opsional. Bawaan `1` untuk menampilkan panduan tahap uji coba Google OAuth di halaman masuk; ubah ke `0` setelah aplikasi OAuth dipublish ke Production di Google Cloud Console. |

Jalankan `npm run setup:sheets` sekali untuk menyiapkan tab operasional. Setelah itu, jalankan `npm run dev`, buka [http://localhost:3000](http://localhost:3000), lalu pilih **Masuk dengan Google** menggunakan email Master Admin. Tambahkan sekolah dan kelas dari menu **Sekolah & Kelas**. Jika aplikasi OAuth masih berstatus **Testing**, tambahkan akun pengujian di pengaturan Google OAuth. Saat menyiapkan publish di Google Cloud Console, halaman `/privasi` dapat dipakai sebagai tautan Kebijakan Privasi.

### Pendaftaran dan pengelolaan akun

- Admin Central dapat membuka **Akun → Tambah akun** untuk Guru BK dan siswa. Focura menambahkan email ke tab `Email` dan menyimpan profil di tab `Akun` pada spreadsheet operasional.
- Guru BK dapat memilih **Daftar sebagai Guru BK** dan memverifikasi akun Google. Pendaftaran muncul di menu **Akun** dengan status **Menunggu persetujuan**. Admin memilih sekolah dan menyetujui pendaftaran untuk menambahkan email ke daftar izin dan membuka akses.
- Gunakan filter **Peran** dan **Status akun** secara bersamaan untuk menemukan akun yang perlu ditinjau, misalnya Guru BK yang menunggu persetujuan.
- Untuk peran lain, tambahkan email ke tab `Email` lalu buat profil dari menu **Akun**. Jika penyimpanan akun terhenti setelah email ditambahkan, muat ulang menu **Akun** dan lanjutkan dari **Buat profil** atau **Tinjau pendaftaran**.

Spreadsheet operasional dikelola aplikasi. Untuk tahap awal, jalankan satu proses Next.js agar perubahan yang bergantung pada data dari Sheets diproses secara berurutan. Deployment dengan beberapa proses memerlukan koordinasi penulisan bersama. Focura memeriksa daftar email, izin akun, dan sesi saat data terlindungi diminta.

### Pembaruan spreadsheet operasional

Jalankan kembali `npm run setup:sheets` pada lingkungan tujuan sebelum memakai materi dan angket. Skrip menambahkan tab yang belum ada dan menyiapkan header `id` dan `data`. Tab serta baris data yang sudah ada tetap digunakan.

| Tab | Data |
| --- | --- |
| `Modul` | Metadata dengan `schoolId` dan `moduleId`. Tiga modul dari konfigurasi langsung tersedia. Perubahan atau penghapusan berlaku pada sekolah Guru BK yang membuatnya. Penghapusan disimpan sebagai penanda agar modul bawaan yang disembunyikan tetap tersembunyi setelah muat ulang. |
| `Angket` | Respons anonim berisi `schoolId`, kode unik per sekolah, dan skor per pernyataan. Rekap menampilkan distribusi skor serta jumlah respons. |
| `Belajar` | Data belajar berdasarkan ID akun siswa. Baris timer beralih dari `focusTimer` ke `focus` setelah waktu terpenuhi atau ke `focusDiscarded` saat direset. Tugas yang dihapus disembunyikan melalui penanda. Sesi fokus dan refleksi lama tetap terbaca. |

Berikan izin Google Drive langsung ke siswa atau kelompok yang dituju. Focura membatasi tautan yang ditampilkan berdasarkan sekolah. Google tetap mengatur akses ke isi berkas dan pratinjau.

### Impor dan ekspor

- **Guru BK** mengunduh template melalui **Database Excel & Form**. Gunakan tab Excel `Angket_Awal` atau CSV dengan kolom `Kode_Respons`, `konsentrasi`, `target`, `strategi`, dan `evaluasi`. Gunakan kode teks unik yang bukan identitas siswa dan skor bilangan bulat 1–5. Kode yang sama di sekolah yang sama dihitung sebagai duplikat.
- **Siswa** mengimpor tugas dari tab Excel `Atur_Tugas` atau CSV. Kolom wajib `Tugas`, `Prioritas` (Tinggi, Sedang, Rendah), dan `Status` (Selesai, Belum Selesai). Kolom `Tanggal` opsional. Duplikat dideteksi per akun berdasarkan judul yang dinormalisasi dan prioritas. Workbook siswa tetap berisi tab `Ringkasan_Siswa`, `Atur_Tugas`, `Sesi_Fokus`, dan `Refleksi_Belajar`.
- Kedua impor menerima XLSX, XLS, atau CSV hingga 5 MB dan 500 baris data. Pratinjau server melaporkan baris valid, duplikat, dan tidak valid. Setelah pengguna mengonfirmasi, server memeriksa ulang dan menyimpan baris yang valid. File asli diproses di browser. Operasi impor terbatas pada data angket Guru BK atau tugas pemilik akun.
- Ekspor Guru BK memuat tab `Rekap_Layanan_BK`, `Rekap_Angket_Awal`, dan `Rekap_Hambatan` dari halaman database. Integrasi Excel memakai versi SheetJS yang dimuat oleh browser.

### Aturan aktivitas dan API

- Ketercapaian RPL memakai empat indikator yang sama pada ruang siswa dan rekap Guru BK. Indikatornya adalah pemilihan hambatan, penyusunan tugas, sesi fokus selesai, dan pencatatan refleksi. Target RPL tercapai pada minimal tiga indikator.
- Timer mendukung 10, 25, 50, dan 1–180 menit untuk durasi kustom. Server menyimpan tenggat serta waktu sisa saat dijeda. Timer dapat dilanjutkan setelah muat ulang. Setelah durasi terpenuhi, siswa bisa menyelesaikan sesi atau membiarkan Focura mencatatnya otomatis. Riwayat tanggal memakai WIB (`Asia/Jakarta`).
- `GET /api/bk/summary` menyediakan rekap agregat sekolah. `POST /api/bk/survey` menerima `rows` dan opsi `preview: true`.
- `GET/POST /api/bk/modules` menampilkan atau menambah modul. `PATCH/DELETE /api/bk/modules/:id` mengubah atau menyembunyikannya di sekolah penugasan. `GET /api/me/modules` menyediakan daftar untuk sekolah siswa.
- `GET /api/me/learning` tetap menyediakan catatan pemilik akun. `POST /api/me/learning` menangani perubahan tugas, refleksi, dan hambatan, serta aksi timer `startFocus`, `pauseFocus`, `resumeFocus`, `resetFocus`, dan `recordFocus`. Penulisan tetap memerlukan sesi berperan sesuai dan origin aplikasi.
- Rekap Guru BK dan Admin Central memakai jumlah refleksi. Akses ke isi konsultasi tetap melalui layanan Google Forms sesuai izin pengelolanya.

## Verifikasi

- `npm test` menjalankan pengujian otorisasi, akun, sesi, pembatasan sekolah, modul, data belajar privat, timer, pengelompokan WIB, dan validasi serta deduplikasi impor dengan penyimpanan uji.
- `npm run build` membuat build produksi.
- `npm start` menjalankan build produksi secara lokal.
