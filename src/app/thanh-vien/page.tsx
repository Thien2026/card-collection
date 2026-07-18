import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function MembersPage() {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  redirect("/ho-so");
}
