import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { createDemoStore, demoEnabled, demoProfile, demoProfiles } from "./demo.js";
import { createFocura, isAppError, SESSION_AGE } from "./focura.js";
import { sheets } from "./sheets.js";

const googleProvider = typeof Google === "function" ? Google : Google.default;
const credentialsProvider = typeof Credentials === "function" ? Credentials : Credentials.default;

// Several App Router entry points share one writer in the single-instance pilot.
const key = Symbol.for("focura.service");
export const focura = globalThis[key] ??= createFocura(demoEnabled ? createDemoStore() : sheets, {
  masterEmail: demoEnabled ? demoProfile.email : process.env.FOCURA_MASTER_EMAIL,
});

const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: demoEnabled
    ? [credentialsProvider({ id: "demo", name: demoProfile.name, credentials: { demoAccount: { type: "text" } },
      authorize(credentials) {
        const id = credentials?.demoAccount || "admin";
        if (!Object.hasOwn(demoProfiles, id)) return null;
        const { email, name } = demoProfiles[id];
        return { id, email, name };
      },
    })]
    : [googleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })],
  pages: { signIn: "/", error: "/" },
  session: { strategy: "jwt", maxAge: SESSION_AGE },
  callbacks: {
    async jwt({ token, account }) {
      return account ? { focuraSessionId: account.focuraSessionId } : token;
    },
    async session({ session, token }) {
      try {
        const { actor } = await focura.context(token.focuraSessionId);
        return { expires: session.expires, user: actor };
      } catch (error) {
        if (!isAppError(error)) console.error("Pemeriksaan sesi gagal.", error.code || error.name);
        return {};
      }
    },
  },
  events: {
    async signOut({ token }) {
      await focura.endSession(token?.focuraSessionId);
    },
  },
};

export function createAuthOptions() {
  // NextAuth resolves the sign-in destination before invoking signIn, including on the Google callback.
  let registerTeacher = false;
  return {
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      redirect({ url, baseUrl }) {
        const target = URL.canParse(url, baseUrl) ? new URL(url, baseUrl) : null;
        const local = target?.origin === baseUrl;
        registerTeacher = !demoEnabled && local && target.pathname === "/" && target.searchParams.get("daftar") === "guru-bk";
        return local ? target.href : baseUrl;
      },
      async signIn({ account, profile, user }) {
        if (account?.provider !== (demoEnabled ? "demo" : "google")) return false;
        try {
          if (registerTeacher) {
            const pending = await focura.registerTeacher(profile);
            return pending ? "/?pendaftaran=tertunda" : "/?pendaftaran=akun-ada";
          }
          account.focuraSessionId = await focura.startSession(demoEnabled ? demoProfiles[user.id] : profile);
          return true;
        } catch (error) {
          if (isAppError(error)) {
            if (registerTeacher) return "/?error=RegistrationDenied";
            if (error.status === 409) return "/?pendaftaran=tertunda";
            return error.message.includes("belum lengkap") ? "/?error=AccessIncomplete" : false;
          }
          console.error("Pemeriksaan akses Google gagal.", error.code || error.name);
          return "/?error=ServiceUnavailable";
        }
      },
    },
  };
}
