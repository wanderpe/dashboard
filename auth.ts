import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { loginFriendAccount } from "@/lib/dashboard-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/account-auth",
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (typeof credentials.email !== "string" || typeof credentials.password !== "string") {
          return null;
        }
        try {
          const account = await loginFriendAccount(credentials.email, credentials.password);
          if (!account.token) return null;
          return {
            id: account.userId,
            email: account.email ?? credentials.email,
            name: account.displayName ?? account.username ?? credentials.email,
            username: account.username ?? null,
            sessionToken: account.token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.username = user.username ?? null;
        token.sessionToken = user.sessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.userId === "string" ? token.userId : token.sub ?? "";
        session.user.username = token.username ?? null;
      }
      return session;
    },
  },
});
