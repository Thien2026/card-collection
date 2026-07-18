import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

class SuspendedAccountError extends CredentialsSignin {
  code = "suspended";
}

class DeletedAccountError extends CredentialsSignin {
  code = "deleted";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/dang-nhap" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = z
          .object({ email: z.string().email(), password: z.string().min(1) })
          .safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (
          !user ||
          !(await bcrypt.compare(parsed.data.password, user.passwordHash))
        ) {
          return null;
        }

        if (user.deletedAt) throw new DeletedAccountError();
        if (user.status === "SUSPENDED") throw new SuspendedAccountError();

        const role = user.role === "ADMIN" ? "ADMIN" : "USER";
        return { id: user.id, name: user.name, email: user.email, role };
      },
    }),
  ],
  callbacks: {
    authorized: ({ auth }) => Boolean(auth?.user),
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        token.role = user.role;
        token.name = user.name;
      }
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as "ADMIN" | "USER";
        if (typeof token.name === "string") session.user.name = token.name;
      }
      return session;
    },
  },
});
