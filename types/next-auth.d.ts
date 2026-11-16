import "next-auth";
import "next-auth/jwt";

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    username?: string | null;
    sessionToken?: string;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    username?: string | null;
    sessionToken?: string;
  }
}
