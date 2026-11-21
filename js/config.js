/**
 * Modul Konfigurasi & Data Statis Focura (Ruang Fokus)
 * Berisi tautan Google Form Konsultasi, Modul Google Drive,
 * dan Dokumen Rencana Pelaksanaan Layanan (RPL) Bimbingan Klasikal.
 */

export const APP_CONFIG = {
  appName: "Focura — Ruang Fokus",
  subtitle: "Media Bimbingan & Konseling Konsentrasi Belajar Siswa SMA",
  consultationFormUrl: "https://forms.gle/SNFh7o8WdDHCGU8XA",
  driveModules: [
    {
      id: "modul-1",
      title: "Modul 1: Konsep Konsentrasi & Pemusatan Perhatian",
      category: "Tips Konsentrasi",
      description: "Memahami perhatian berkelanjutan (sustained attention) serta pemetaan faktor internal & eksternal pengganggu belajar.",
      editUrl: "https://docs.google.com/document/d/1-X4NfZKUDpVSCfd5QjZTYBCM1rXAtEgU/edit?usp=drive_link&ouid=117363627042746594064&rtpof=true&sd=true",
      previewUrl: "https://docs.google.com/document/d/1-X4NfZKUDpVSCfd5QjZTYBCM1rXAtEgU/preview"
    },
    {
      id: "modul-2",
      title: "Modul 2: Strategi Mengelola Distraksi Digital & Waktu Belajar",
      category: "Manajemen Waktu",
      description: "Panduan praktis mengurangi gangguan ponsel/media sosial, mengatur jeda belajar, dan membagi tugas menjadi bagian kecil.",
      editUrl: "https://docs.google.com/document/d/167git0j5Vu-1Mdwa4x6vhqhCXHJWLO1y/edit?usp=drive_link&ouid=117363627042746594064&rtpof=true&sd=true",
      previewUrl: "https://docs.google.com/document/d/167git0j5Vu-1Mdwa4x6vhqhCXHJWLO1y/preview"
    },
    {
      id: "modul-3",
      title: "Modul 3: Regulasi Diri (Self-Regulated Learning) & Refleksi",
      category: "Cara Belajar",
      description: "Penerapan siklus perencanaan, pemantauan fokus, dan evaluasi kebiasaan belajar mandiri bagi peserta didik SMA.",
      editUrl: "https://docs.google.com/document/d/1mz9y2fov2HN7F5tb_FxQ-YNVo3wQ2GU1/edit?usp=drive_link&ouid=117363627042746594064&rtpof=true&sd=true",
      previewUrl: "https://docs.google.com/document/d/1mz9y2fov2HN7F5tb_FxQ-YNVo3wQ2GU1/preview"
    }
  ],
  barriersList: [
    { id: "hp", label: "Distraksi HP dan media sosial", explanation: "Notifikasi dapat memecah perhatian dan menyulitkanmu kembali ke tugas.", tip: "Aktifkan mode Jangan Ganggu atau simpan HP di luar jangkauan untuk satu sesi fokus." },
    { id: "waktu", label: "Kesulitan mengatur waktu", explanation: "Target yang terlalu luas bisa membuat sulit menentukan langkah awal.", tip: "Gunakan Atur Tugas untuk membagi materi menjadi target 15–25 menit." },
    { id: "bosan", label: "Mudah bosan atau lelah", explanation: "Perhatian dapat menurun ketika belajar terlalu lama tanpa jeda.", tip: "Coba satu sesi fokus 10–25 menit lalu ambil jeda peregangan 3–5 menit." },
    { id: "lingkungan", label: "Lingkungan belajar tidak kondusif", explanation: "Suara, lalu lintas orang, atau meja yang penuh bisa mengalihkan perhatian.", tip: "Siapkan tempat yang lebih tenang dan sisakan hanya perlengkapan untuk satu tugas." },
    { id: "melayang", label: "Pikiran mudah melayang atau kehilangan fokus", explanation: "Pikiran lain terkadang muncul saat mengerjakan tugas.", tip: "Catat pikiran itu singkat, lalu kembali ke satu langkah yang bisa kamu selesaikan sekarang." },
    { id: "materi", label: "Kesulitan memahami materi pelajaran yang kompleks", explanation: "Bagian yang belum dipahami bisa menghentikan alur belajar.", tip: "Baca ringkasan modul di Google Drive terlebih dahulu lalu catat poin pertanyaan untuk didiskusikan." },
    { id: "tunda", label: "Sering menunda-nunda tugas sekolah (prokrastinasi)", explanation: "Memulai tugas bisa terasa berat saat langkah pertamanya belum jelas.", tip: "Mulai dari tugas berdurasi 10 menit menggunakan timer Mulai Fokus agar hambatan awal berkurang." }
  ],
  rplDocument: {
    judul: "RENCANA PELAKSANAAN LAYANAN (RPL) BIMBINGAN KLASIKAL BIDANG BELAJAR",
    identitas: [
      ["Satuan Pendidikan", "Sekolah Menengah Atas (SMA)"],
      ["Kelas / Semester", "X – XII / Ganjil"],
      ["Komponen Layanan", "Layanan Dasar"],
      ["Bidang Layanan", "Belajar"],
      ["Topik Layanan", "Ruang Fokus: Pengembangan Website Interaktif sebagai Media BK untuk Membantu Peserta Didik di SMA dalam Mengembangkan Konsentrasi Belajar (FOCURA)"],
      ["Fungsi Layanan", "Pemahaman, Pencegahan, Pengembangan"],
      ["Alokasi Waktu", "2 × 45 Menit (1 Pertemuan)"],
      ["Metode & Media", "Eksplorasi digital mandiri, latihan fokus terbimbing, diskusi kelompok, refleksi diri, penyusunan target belajar via Website FOCURA"]
    ],
    rasional: "Peserta didik jenjang SMA menghadapi tuntutan akademik yang beragam dan perlu mengelola perhatian secara mandiri baik di kelas maupun di rumah. Website interaktif FOCURA (Ruang Fokus) dirancang sebagai suplemen layanan tatap muka yang edukatif, preventif, non-diagnostik, serta menjunjung tinggi perlindungan data pribadi dan privasi siswa sesuai UU No. 27 Tahun 2022.",
    tujuanUmum: "Peserta didik mampu mengenali faktor pemicu gangguan konsentrasi belajar, menerapkan strategi pengelolaan perhatian serta regulasi diri secara mandiri, dan menyusun target serta refleksi belajar yang terarah melalui website interaktif FOCURA.",
    materiPokok: "Konsentrasi dan pemusatan perhatian, pemicu distraksi, pengelolaan waktu, penentuan prioritas belajar, serta regulasi diri dan refleksi.",
    evaluasi: "Tinjau ketercapaian minimal tiga dari empat aktivitas Focura melalui pemetaan hambatan, penyusunan tugas, sesi fokus selesai, dan pencatatan refleksi. Gunakan indikator aktivitas dan diskusi sukarela. Isi refleksi tetap berada di ruang pribadi siswa.",
    tindakLanjut: "Peserta didik mencoba strategi fokus pada kegiatan belajar berikutnya. Guru BK memberi penguatan dan menyediakan konsultasi sukarela melalui formulir yang tersedia.",
    langkahPelaksanaan: [
      { tahap: "1. Pendahuluan (10 Menit)", rincian: "Guru BK menyapa peserta didik, membangun suasana kondusif, menyampaikan tujuan layanan, menjelaskan prinsip privasi data & persetujuan sadar (informed consent), serta mengarahkan siswa masuk dengan akun Google yang terdaftar di Focura." },
      { tahap: "2. Kegiatan Inti — Eksplorasi & Identifikasi (15 Menit)", rincian: "Peserta didik membaca ringkasan pada halaman Beranda & menu Materi (terhubung Google Drive), lalu mengisi fitur Kenali Hambatan secara non-diagnostik." },
      { tahap: "3. Kegiatan Inti — Latihan Fokus & Target (20 Menit)", rincian: "Guru BK memandu penyusunan prioritas pada fitur Atur Tugas, dilanjutkan simulasi sesi belajar terfokus menggunakan timer Mulai Fokus." },
      { tahap: "4. Kegiatan Inti — Diskusi Kelompok (10 Menit)", rincian: "Diskusi kelompok kecil mengenai studi kasus gangguan konsentrasi belajar siswa SMA dan perumusan strategi regulasi diri." },
      { tahap: "5. Kegiatan Inti — Refleksi & Jejak Progres (20 Menit)", rincian: "Peserta didik menuliskan evaluasi pada fitur Refleksi Belajar, memantau grafik Jejak Progres, dan mengunduh catatan belajar." },
      { tahap: "6. Penutup & Tindak Lanjut (15 Menit)", rincian: "Perwakilan peserta didik menyampaikan hasil refleksi secara sukarela. Guru BK memberikan penguatan positif dan membuka jalur Konsultasi Guru BK via Google Form." }
    ]
  }
};
