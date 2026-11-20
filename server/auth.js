import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { createDemoStore, demoEnabled, demoProfile } from "./demo.js";
import { createFocura, isAppError, SESSION_AGE } from "./focura.js";
import { sheets } from "./sheets.js";

const googleProvider = typeof Google === "function" ? Google : Google.default;
const credentialsProvider = typeof Credentials === "function" ? Credentials : Credentials.default;

// Several App Router entry points share one writer in the single-instance pilot.
const key = Symbol.for("focura.service");
export const focura = globalThis[key] ??= createFocura(demoEnabled ? createDemoStore() : sheets, {
  masterEmail: demoEnabled ? demoProfile.email : process.env.FOCURA_MASTER_EMAIL,
});

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: demoEnabled
    ? [credentialsProvider({ id: "demo", name: demoProfile.name, credentials: {},
      authorize: () => ({ id: demoProfile.sub, email: demoProfile.email, name: demoProfile.name }) })]
    : [googleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })],
  pages: { signIn: "/", error: "/" },
  session: { strategy: "jwt", maxAge: SESSION_AGE },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== (demoEnabled ? "demo" : "google")) return false;
      try {
        account.focuraSessionId = await focura.startSession(demoEnabled ? demoProfile : profile);
        return true;
      } catch (error) {
        if (isAppError(error)) return error.message.includes("belum lengkap") ? "/?error=AccessIncomplete" : false;
        console.error("Pemeriksaan akses Google gagal.", error.code || error.name);
        return "/?error=ServiceUnavailable";
      }
    },
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
