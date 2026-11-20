import "../css/style.css";

export const metadata = {
  title: "Focura — Ruang Fokus | Media Interaktif Bimbingan & Konseling SMA",
  description: "Ruang belajar dan layanan bimbingan konseling Focura.",
  icons: { icon: "/assets/svg/logo-focura.svg" },
};

export default function RootLayout({ children }) {
  return <html lang="id"><body>{children}</body></html>;
}
