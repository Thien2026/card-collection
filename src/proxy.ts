import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth(async (request) => {
  const { pathname, search } = request.nextUrl;
  const session = request.auth;

  if (pathname === "/dang-nhap") {
    if (!session?.user) return NextResponse.next();
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname === "/dang-xuat-bat-buoc") {
    return NextResponse.next();
  }

  if (!session?.user) {
    const loginUrl = new URL("/dang-nhap", request.url);
    const callbackUrl = `${pathname}${search}`;
    if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
      loginUrl.searchParams.set("callbackUrl", callbackUrl);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Mid-session suspend/soft-delete: verify against DB via Node API.
  try {
    const statusUrl = new URL("/api/account-access", request.url);
    const response = await fetch(statusUrl, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as { access?: string };
      if (data.access === "SUSPENDED" || data.access === "DELETED") {
        const logout = new URL("/dang-xuat-bat-buoc", request.url);
        logout.searchParams.set(
          "lyDo",
          data.access === "DELETED" ? "deleted" : "suspended",
        );
        return NextResponse.redirect(logout);
      }
      if (data.access === "MISSING") {
        const logout = new URL("/dang-xuat-bat-buoc", request.url);
        logout.searchParams.set("lyDo", "deleted");
        return NextResponse.redirect(logout);
      }
    }
  } catch {
    // Ignore probe failures; page-level auth still protects writes.
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|.*\\.[^/]+$).*)",
  ],
};
