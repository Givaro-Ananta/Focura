/**
 * Modul Autentikasi & Isolasi Privasi Pengguna (UU PDP No. 27 Tahun 2022)
 * - Siswa wajib mendaftar akun terlebih dahulu sebelum masuk.
 * - Setiap akun siswa memiliki ruang penyimpanan terisolasi (per userId) sehingga
 *   siswa tidak dapat mengakses data milik siswa lain maupun ruang admin.
 * - Akun admin khusus mltihrnnda@gmail.com dengan sandi "ninda226" masuk ke Ruang Guru BK.
 */

import { APP_CONFIG } from "./config.js";

const USERS_KEY = "focura_registered_students_v1";
const SESSION_KEY = "focura_active_session_v1";

export function getRegisteredStudents() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

export function registerStudent({ fullName, nis, kelas, email, password, consent }) {
  if (!consent) {
    return { ok: false, message: "Anda wajib menyetujui pernyataan privasi & informed consent terlebih dahulu." };
  }
  if (!fullName || !nis || !kelas || !email || !password) {
    return { ok: false, message: "Semua kolom pendaftaran wajib diisi lengkap." };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === APP_CONFIG.adminAccount.email.toLowerCase()) {
    return { ok: false, message: "Email ini terdaftar khusus sebagai akun Guru BK / Admin." };
  }
  if (password.length < 6) {
    return { ok: false, message: "Kata sandi minimal 6 karakter demi keamanan privasi akun." };
  }

  const students = getRegisteredStudents();
  const exists = students.some(
    (s) => s.email.toLowerCase() === normalizedEmail || s.nis.trim() === nis.trim()
  );
  if (exists) {
    return { ok: false, message: "Email atau NIS sudah terdaftar. Silakan masuk melalui tab Login Siswa." };
  }

  const newStudent = {
    id: "STD-" + Date.now(),
    fullName: fullName.trim(),
    nis: nis.trim(),
    kelas: kelas.trim(),
    email: normalizedEmail,
    password: password,
    role: "student",
    consentAcceptedAt: new Date().toISOString(),
    shareSummaryWithBK: true
  };

  students.push(newStudent);
  localStorage.setItem(USERS_KEY, JSON.stringify(students));

  return {
    ok: true,
    message: "Akun siswa berhasil dibuat! Silakan masuk menggunakan email/NIS dan kata sandi Anda."
  };
}

export function loginUser(identifier, password, mode = "student") {
  const cleanId = (identifier || "").trim().toLowerCase();

  // Jalur Khusus Ruang Admin Guru BK
  if (mode === "admin") {
    if (
      cleanId === APP_CONFIG.adminAccount.email.toLowerCase() &&
      password === APP_CONFIG.adminAccount.passwordHash
    ) {
      const adminSession = {
        id: "ADMIN-BK-01",
        fullName: APP_CONFIG.adminAccount.name,
        email: APP_CONFIG.adminAccount.email,
        role: "admin_bk",
        loginAt: new Date().toISOString()
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminSession));
      return { ok: true, user: adminSession };
    }
    return {
      ok: false,
      message: "Akses ditolak. Ruang Admin hanya untuk akun resmi Guru BK dengan kredensial valid."
    };
  }

  // Mencegah akun admin masuk ke mode siswa secara keliru
  if (cleanId === APP_CONFIG.adminAccount.email.toLowerCase()) {
    return {
      ok: false,
      message: "Akun Guru BK harus masuk melalui tab 'Login Admin BK'."
    };
  }

  // Jalur Login Siswa (Wajib sudah membuat akun terlebih dahulu)
  const students = getRegisteredStudents();
  const matched = students.find(
    (s) =>
      (s.email.toLowerCase() === cleanId || s.nis.toLowerCase() === cleanId) &&
      s.password === password
  );

  if (!matched) {
    return {
      ok: false,
      message: "Akun tidak ditemukan atau kata sandi salah. Siswa baru wajib membuat akun terlebih dahulu pada tab 'Daftar Akun Siswa'."
    };
  }

  const studentSession = {
    id: matched.id,
    fullName: matched.fullName,
    nis: matched.nis,
    kelas: matched.kelas,
    email: matched.email,
    role: "student",
    loginAt: new Date().toISOString()
  };

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(studentSession));
  return { ok: true, user: studentSession };
}

export function getActiveSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function logoutUser() {
  sessionStorage.removeItem(SESSION_KEY);
}
