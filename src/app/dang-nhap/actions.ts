"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";

export type SignInState = { error?: string };

export async function authenticate(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/sau-dang-nhap",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      const code =
        error instanceof CredentialsSignin
          ? error.code
          : "code" in error
            ? String((error as { code?: string }).code ?? "")
            : "";
      if (code === "suspended") {
        return {
          error:
            "Tài khoản đang bị đình chỉ. Liên hệ quản trị viên để được mở lại.",
        };
      }
      if (code === "deleted") {
        return {
          error:
            "Tài khoản đã bị xoá. Liên hệ quản trị viên nếu đây là nhầm lẫn.",
        };
      }
      if (error.type === "CredentialsSignin") {
        return { error: "Email hoặc mật khẩu không đúng. Vui lòng thử lại." };
      }
      return { error: "Không thể đăng nhập lúc này. Vui lòng thử lại." };
    }
    throw error;
  }
}
