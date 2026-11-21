import NextAuth from "next-auth";
import { createAuthOptions } from "../../../../server/auth.js";
import { demoEnabled } from "../../../../server/demo.js";

const nextAuth = typeof NextAuth === "function" ? NextAuth : NextAuth.default;

function auth(request, context) {
  if (!process.env.NEXTAUTH_SECRET || (!demoEnabled && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET))) {
    return Response.json({ error: "Konfigurasi Google OAuth belum tersedia." }, { status: 503 });
  }
  return nextAuth(request, context, createAuthOptions());
}

export { auth as GET, auth as POST };
