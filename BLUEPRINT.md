# Blueprint Pengembangan Focura — Ruang Fokus

Dokumen ini menerjemahkan [requirement(feature).txt](./requirement%28feature%29.txt) menjadi rencana implementasi. Mulai dari autentikasi pengguna, kemudian sambungkan dashboard dan pengelolaan lintas sekolah.

## 1. Arsitektur dan integrasi UI

Pertahankan desain Focura yang sekarang, termasuk tata letak login, sidebar, kartu statistik, tabel, gaya responsif, logo, dan ilustrasi. Gunakan panel autentikasi yang ada untuk tombol **Masuk dengan Google**. Pakai pola panel yang sama untuk informasi anak dan kontrol pengelolaan Admin Central.

- **Aplikasi.** Gunakan Next.js App Router. Pindahkan markup halaman dan gaya yang ada ke Next.js secara bertahap. Gunakan Route Handlers untuk autentikasi dan API pada origin yang sama. [Dokumentasi Next.js](https://nextjs.org/docs/app/getting-started/route-handlers)
- **Login.** Gunakan Google OAuth melalui Auth.js sebagai usulan implementasi. Konfigurasikan OAuth Web Client dan callback yang sesuai sebelum menguji login Google. Untuk pengembangan, Google mendukung redirect URI `localhost` yang didaftarkan pada client. [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) · [Provider Google di Auth.js](https://authjs.dev/getting-started/providers/google)
- **Spreadsheet.** Gunakan Google Sheets privat untuk tahap awal. Master Admin mengisi daftar email. Server Next.js mengakses spreadsheet melalui Google Sheets API dan service account yang diberi akses ke dokumen. Simpan kredensial integrasi hanya di server. Akses spreadsheet memakai konfigurasi tersendiri dari OAuth login. [Kredensial Google Workspace](https://developers.google.com/workspace/guides/create-credentials) · [Kuota Sheets API](https://developers.google.com/workspace/sheets/api/limits)

| Aset saat ini                                      | Pekerjaan saat implementasi                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`, `css/style.css`, `assets/svg/` | Pakai komponen visual yang ada untuk login, dashboard siswa, dashboard Guru BK, dashboard pusat, dan panel informasi anak.          |
| `js/auth.js`                                     | Pindahkan autentikasi ke login Google dan pemeriksaan daftar email di server. Hubungkan frontend ke sesi dan logout Next.js.        |
| `js/app.js`                                      | Tentukan panel dari peran yang dikembalikan server. Ganti sumber daftar dan statistik dashboard dari browser ke API.                |
| `js/config.js`                                   | Simpan konfigurasi publik untuk materi, konsultasi, dan RPL. Hapus kredensial Guru BK/Admin yang tertanam saat login Google siap.   |
| `js/storage.js`, `js/excel-sync.js`            | Hubungkan penyimpanan belajar dan sumber rekap Excel ke data yang diizinkan server. Pertahankan format workbook yang dipakai siswa. |

## 2. Hak akses

| Peran                        | Cakupan data                                                                                           | Tindakan                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Admin Central (Master Admin) | Seluruh sekolah. Daftar dan aktivitas login Guru BK serta siswa.                                       | Tambahkan email secara manual di spreadsheet. Kelola sekolah, peran, izin login, tautan wali, serta keanggotaan kelas di Focura. |
| Guru BK                      | Daftar dan aktivitas login siswa di sekolah penugasan. Akses baca ke ringkasan belajar yang diizinkan. | Lihat siswa yang sedang login dan waktu login terakhir. Setiap Guru BK memiliki akun individual.                                 |
| Siswa                        | Profil dan data belajar sendiri.                                                                       | Masuk dengan akun Google yang sudah diizinkan dan gunakan fitur belajar yang tersedia.                                           |
| Orang tua/wali               | Informasi anak yang ditautkan ke akunnya, seperti nama, sekolah, dan kelas.                            | Lihat informasi anak.                                                                                                            |

Server memeriksa sesi, peran, dan cakupan data pada setiap permintaan, termasuk permintaan ekspor. Untuk Guru BK, server mengambil sekolah dari akun yang sedang masuk. Untuk orang tua/wali, server memeriksa tautan dengan siswa yang diminta. Tampilan panel mengikuti hasil pemeriksaan server. Dashboard pemantauan menggunakan profil, status login, dan rekap belajar yang diizinkan. Isi refleksi pribadi dan jawaban konsultasi berada di luar cakupan pemantauan.

## 3. Model data di spreadsheet

| Tab atau kelompok data | Data dan relasi                                                                                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daftar email           | Satu kolom `email`. Master Admin memasukkan alamat Google yang diizinkan. Ini satu-satunya data yang perlu diisi manual saat enrollment.                                                                                        |
| Sekolah                | ID dan nama. Sekolah dapat memiliki beberapa kelas, siswa, dan akun Guru BK sesuai penugasan.                                                                                                                                     |
| Kelas                  | ID, ID sekolah, dan nama kelas. Kelas yang dipilih untuk siswa harus berasal dari sekolahnya.                                                                                                                                     |
| Akun                   | ID Focura, nama, email terdaftar, identitas Google `sub`, peran, status izin login, dan waktu login terakhir. Admin Central menetapkan sekolah untuk siswa dan Guru BK. Untuk siswa, simpan NIS dan kelas sebagai data sekolah. |
| Tautan wali–siswa     | Pasangan ID akun orang tua/wali dan siswa yang ditetapkan Admin Central. Validasi kedua peran dan cegah pasangan ganda.                                                                                                           |
| Sesi                   | ID akun, pengenal sesi, waktu mulai, waktu kedaluwarsa, dan waktu pencabutan jika sesi dicabut.                                                                                                                                   |
| Data belajar siswa     | Terhubung ke ID akun siswa. Data tugas, fokus, hambatan, dan refleksi menjadi sumber untuk ruang pribadi siswa. Server hanya mengirim kolom ringkasan yang sesuai ke rekap pemantauan.                                            |

Pisahkan daftar email yang diedit Master Admin dari data operasional seperti sesi dan catatan belajar. Data operasional dikelola Next.js di spreadsheet privat untuk tahap awal. Gunakan ID akun sebagai kunci tetap. Validasi alamat email dan abaikan baris kosong serta duplikat pada daftar email. Kelompokkan permintaan Sheets bila memungkinkan agar tetap dalam kuota, dan uji login serentak agar satu identitas Google hanya menghasilkan satu akun Focura. Siapkan data uji dengan **SMA 1 Bandar Lampung** dan **SMA 1 Talang Padang**. [Panduan batch request Google Sheets](https://developers.google.com/workspace/sheets/api/samples)

## 4. Alur utama

### Enrollment, login Google, dan sesi

1. Master Admin memasukkan email ke spreadsheet. Penetapan peran, sekolah, kelas, dan tautan wali dikelola melalui Focura sesuai kebutuhan. Masukkan juga email Master Admin pertama ke spreadsheet dan tetapkan perannya melalui konfigurasi awal di server.
2. Pengguna memilih **Masuk dengan Google**. Server memvalidasi identitas dari Google, termasuk status email terverifikasi, lalu mencocokkan alamat email dengan daftar yang diizinkan. Gunakan `sub` sebagai identitas Google yang stabil dan gunakan email untuk pemeriksaan izin. [Dokumentasi Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
3. Server menolak login Focura jika email belum tercatat atau izin aksesnya dinonaktifkan. Jika peran atau penugasan yang diperlukan belum tersedia, tampilkan bahwa akses belum lengkap. Untuk akun yang siap, server mencatat sesi dan waktu login terakhir lalu membuka panel sesuai peran.
4. Simpan sesi aplikasi di server dan gunakan cookie sesi `HttpOnly`, `Secure` pada HTTPS, dan `SameSite`. Periksa status email dan izin akun pada permintaan data. Logout mengakhiri sesi perangkat tersebut. Penonaktifan melalui panel Admin Central mencabut semua sesi akun dan mencegah login baru hingga akses dipulihkan.

### Pemantauan dan pengelolaan kelas

1. Admin Central membuka ringkasan lintas sekolah atau memilih satu sekolah. Tampilkan jumlah akun Guru BK dan siswa terdaftar, jumlah yang sedang login per peran, serta daftar nama, sekolah, status sesi, dan waktu login terakhir. Tampilkan kelas atau **Belum Memiliki Kelas** pada baris siswa.
2. Guru BK memakai tampilan tabel yang sama untuk melihat siswa di sekolah penugasannya. Orang tua/wali membuka panel informasi untuk anak yang tertaut.
3. Hitung akun yang sedang login berdasarkan keberadaan minimal satu sesi yang belum kedaluwarsa dan belum dicabut. Hitung satu akun sekali, meski ada beberapa perangkat. Tutup tab tidak mengakhiri sesi secara otomatis. Ambil status terbaru dari server saat dashboard dimuat atau cakupannya diganti.
4. Admin Central memilih **Keluarkan dari Kelas** pada baris siswa. Server mengosongkan keanggotaan kelas dan daftar kelas segera mencerminkan perubahan. Di daftar sekolah, siswa berstatus **Belum Memiliki Kelas**, dapat masuk jika izin login aktif, dan dapat diberi kelas baru. Catatan belajar tetap terhubung ke ID akun yang sama.

## 5. Usulan kontrak API

| Operasi                                                              | Pelaku dan hasil                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/[...nextauth]`                                          | Tangani login, callback Google, pemeriksaan sesi, dan logout. Periksa daftar email dan izin Focura di server sebelum memberi akses. |
| `GET /api/schools/{id}/classes`                                    | Admin Central membaca pilihan kelas di sekolah siswa untuk penetapan kelas.                                                         |
| `GET /api/central/overview`, `GET /api/central/schools/{id}`     | Admin Central membaca ringkasan pusat atau rincian Guru BK dan siswa per sekolah.                                                   |
| `POST /api/central/schools`, `PATCH /api/central/schools/{id}`   | Admin Central menambah atau mengubah sekolah.                                                                                       |
| `POST /api/central/accounts`, `PATCH /api/central/accounts/{id}` | Admin Central menyiapkan profil untuk email yang sudah di-enroll dan mengubah peran, sekolah, serta izin login.                     |
| `PATCH /api/central/students/{id}/class`                           | Admin Central menetapkan kelas atau mengirim `classId: null` untuk mengeluarkan siswa dari kelas.                                 |
| `POST /api/central/guardian-links`                                 | Admin Central menautkan akun orang tua/wali dengan siswa.                                                                           |
| `GET /api/bk/students`                                             | Guru BK membaca daftar dan status sesi siswa di sekolahnya, beserta rekap yang diizinkan.                                           |
| `GET /api/guardian/children`                                       | Orang tua/wali membaca informasi siswa yang tertaut ke akunnya.                                                                     |
| Operasi `/api/me/learning`                                         | Siswa membaca dan menyimpan data belajarnya. Server mengambil ID siswa dari sesi.                                                   |

## 6. Tahapan implementasi dan verifikasi

| Tahap                           | Pekerjaan                                                                                                                                                                                | Verifikasi                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Autentikasi pengguna         | Siapkan Next.js, OAuth Google, spreadsheet daftar email, data akun dan sesi, serta Master Admin pertama. Hubungkan tombol login dan logout ke panel yang ada.                            | Email yang belum tercatat ditolak meski berhasil autentikasi di Google. Setelah Master Admin menambahkan email dan peran siap, akun masuk ke panel yang sesuai. Dua Guru BK di satu sekolah memakai akun Google berbeda.                                       |
| 2. Akses baca dashboard         | Ambil status sesi dan daftar akun dari server. Terapkan penyaringan Guru BK berdasarkan sekolah dan orang tua/wali berdasarkan tautan anak. Siapkan tautan wali–siswa sebagai data uji. | Admin Central melihat angka kedua sekolah. Satu akun dengan dua sesi dihitung sekali, lalu tidak tercatat aktif setelah sesi terakhir berakhir. Permintaan Guru BK untuk data guru atau sekolah lain dan permintaan wali untuk data siswa lain ditolak server. |
| 3. Pengelolaan di Admin Central | Sambungkan pengelolaan sekolah, profil email terdaftar, izin login, tautan wali, dan keanggotaan kelas ke panel pusat.                                                                   | Admin Central bisa menetapkan profil, mengubah peran atau sekolah, dan mencabut seluruh sesi saat menonaktifkan akses. Keluarkan siswa dari kelas, cek statusnya, lalu tetapkan kelas baru.                                                                    |
| 4. Data belajar dan regresi     | Sambungkan data belajar serta sumber ekspor rekap. Gunakan ringkasan yang diizinkan lewat server. Uji alur lama dan tampilan yang digunakan kembali.                                     | Siswa yang sudah keluar dari kelas masih dapat membuka catatannya. Tugas, timer, refleksi, materi, konsultasi, RPL, dan Excel berjalan sesuai alur lama. Guru BK dan Admin Central mendapat rekap sesuai cakupan. Periksa desktop dan ponsel.                  |

Jika data lama perlu dipindahkan, petakan ID siswa lokal dari browser asal ke akun dan sekolah baru sebelum mengimpor catatan. Catatan waktu login lintas perangkat dimulai ketika server mulai mencatat sesi.

## 7. Penyimpanan file unggahan

Impor Excel yang ada membaca workbook di browser dan mengambil data tugas. Pada tahap awal, simpan hasil impor melalui API Focura. Penyimpanan file diperlukan saat pengguna perlu menyimpan dan mengunduh kembali file aslinya. **S****upabase Storage Free** dengan bucket privat. Paket gratis mencakup **1 GB penyimpanan file** dengan batas **50 MB per file**. Proyek gratis dapat dijeda setelah
