import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccountAccess } from "@/lib/account-access";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ access: "NONE" as const });
  }
  const access = await getAccountAccess(session.user.id);
  return NextResponse.json({ access });
}
