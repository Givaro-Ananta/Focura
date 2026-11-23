export const metadata = {
  title: "Kebijakan Privasi — Focura",
  description: "Informasi penggunaan data akun Google dan kerahasiaan data belajar di Focura.",
};

export default function PrivacyPage() {
  return (
    <div className="privacy-page">
      <header className="auth-header">
        <div className="auth-logo-row">
          <img src="/assets/svg/logo-focura.svg" alt="" width="44" height="44" />
          <div>
            <strong>Focura</strong>
            <span>Ruang Fokus</span>
          </div>
        </div>
        <a className="btn btn-outline privacy-back" href="/">Kembali ke halaman masuk</a>
      </header>
      <main className="privacy-card">
        <h1>Kebijakan Privasi Focura</h1>
        <p className="privacy-lead">
          Ringkasan penggunaan data akun Google dan pelindungan informasi layanan Bimbingan dan Konseling di Focura.
        </p>

        <section className="privacy-section">
          <h2>1. Data yang Diakses dari Akun Google</h2>
          <p>
            Focura hanya menerima profil dasar OpenID dari akun Google, yaitu nama tampilan, alamat email, dan status
            verifikasi email untuk mencocokkan akun terdaftar. Focura tidak membaca atau mengakses Gmail, Google Drive
            pribadi, Kontak, maupun Kalender pengguna.
          </p>
        </section>

        <section className="privacy-section">
          <h2>2. Data yang Dikelola di Focura</h2>
          <p>
            Aplikasi menyimpan identitas akun terdaftar (nama, alamat email, peran, sekolah/kelas), catatan belajar
            siswa (daftar tugas, sesi fokus, pemetaan hambatan, refleksi belajar), serta respons angket awal anonim
            tanpa identitas pribadi siswa.
          </p>
        </section>

        <section className="privacy-section">
          <h2>3. Kerahasiaan &amp; Pembatasan Peran</h2>
          <p>
            Refleksi belajar siswa bersifat privat bagi pemilik akun. Guru BK dan Admin Central hanya melihat ringkasan
            progres sesuai kewenangan dan penugasan sekolah, sedangkan orang tua/wali hanya melihat nama, sekolah, dan
            kelas anak yang ditautkan. Pengelolaan data berpedoman pada prinsip pelindungan data pribadi (UU No. 27
            Tahun 2022).
          </p>
        </section>

        <section className="privacy-section">
          <h2>4. Keamanan Sesi</h2>
          <p>
            Sesi autentikasi dilindungi dengan cookie terenkripsi yang diverifikasi di sisi server terhadap daftar akun
            aktif dan dapat diakhiri kapan saja melalui tombol Keluar.
          </p>
        </section>

        <section className="privacy-section">
          <h2>5. Pembaruan Data atau Pencabutan Akses</h2>
          <p>
            Pengguna dapat menghubungi Guru BK atau Admin Central sekolah untuk memperbarui profil akun, menonaktifkan
            akses, atau meminta penghapusan catatan belajar sesuai kebijakan sekolah.
          </p>
        </section>
      </main>
    </div>
  );
}
