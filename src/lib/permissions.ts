import { auth } from "@/auth";
import {
  accountAccessMessage,
  getAccountAccess,
} from "@/lib/account-access";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  const access = await getAccountAccess(session.user.id);
  if (access !== "ACTIVE") {
    throw new Error(
      access === "SUSPENDED"
        ? "ACCOUNT_SUSPENDED"
        : access === "DELETED"
          ? "ACCOUNT_DELETED"
          : "UNAUTHORIZED",
    );
  }
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export { accountAccessMessage, getAccountAccess };
