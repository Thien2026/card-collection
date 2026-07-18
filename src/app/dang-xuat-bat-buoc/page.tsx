import { redirect } from "next/navigation";
import { signOut } from "@/auth";

export default async function ForcedSignOutPage({
  searchParams,
}: {
  searchParams: Promise<{ lyDo?: string }>;
}) {
  const { lyDo } = await searchParams;
  const reason =
    lyDo === "deleted" || lyDo === "DELETED"
      ? "deleted"
      : lyDo === "suspended" || lyDo === "SUSPENDED"
        ? "suspended"
        : "blocked";
  await signOut({ redirect: false });
  redirect(`/dang-nhap?lyDo=${reason}`);
}
