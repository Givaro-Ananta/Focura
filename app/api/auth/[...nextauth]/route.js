import NextAuth from "next-auth";
import { authOptions } from "../../../../server/auth.js";
import { demoEnabled } from "../../../../server/demo.js";

const nextAuth = typeof NextAuth === "function" ? NextAuth : NextAuth.default;
const handler = nextAuth(authOptions);

function auth(request, context) {
  if (!process.env.NEXTAUTH_SECRET || (!demoEnabled && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET))) {
    return Response.json({ error: "Konfigurasi Google OAuth belum tersedia." }, { status: 503 });
  }
  return handler(request, context);
}

export { auth as GET, auth as POST };
