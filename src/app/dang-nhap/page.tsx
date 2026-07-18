import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Đăng nhập",
  description: "Đăng nhập để quản lý bộ sưu tập card của bạn.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ lyDo?: string }>;
}) {
  const session = await auth();
  if (session) redirect("/");
  const { lyDo } = await searchParams;
  const notice =
    lyDo === "suspended"
      ? "Tài khoản đang bị đình chỉ. Liên hệ quản trị viên để được mở lại."
      : lyDo === "deleted"
        ? "Tài khoản đã bị xoá. Liên hệ quản trị viên nếu đây là nhầm lẫn."
        : lyDo === "blocked"
          ? "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại."
          : undefined;

  return (
    <main
      className="relative min-h-[100svh] w-full overflow-x-hidden overflow-y-auto bg-[#07091d] bg-[url('/images/bg-login.png')] bg-cover bg-center bg-no-repeat text-white"
      style={{ colorScheme: "dark" }}
    >
      <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-xl items-center justify-center px-4 py-5 sm:px-6 sm:py-8">
        <SignInForm notice={notice} />
      </div>
    </main>
  );
}
