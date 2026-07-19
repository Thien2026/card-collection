import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, House } from "lucide-react";
import { LOGO_SRC } from "@/lib/brand";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-10 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.2),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.12),transparent_50%)]"
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-app-border bg-surface/90 px-6 py-10 shadow-2xl shadow-[var(--shadow)] backdrop-blur sm:px-8">
        <Image
          src={LOGO_SRC}
          alt="Card Collection"
          width={96}
          height={96}
          className="mx-auto rounded-2xl"
          priority
        />
        <p className="mt-6 text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">
          Lỗi 404
        </p>
        <h1 className="mt-2 text-2xl font-black text-primary sm:text-3xl">
          Không tìm thấy trang
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-secondary">
          Link có thể đã hết hạn, hoặc thẻ / bộ sưu tập / đơn hàng đã bị xoá.
          Mục trong “Xem gần đây” đôi khi còn giữ link cũ.
        </p>
        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-violet-950/25"
          >
            <House size={16} />
            Về trang chủ
          </Link>
          <Link
            href="/bo-suu-tap"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-app-border bg-panel px-5 py-3.5 text-sm font-bold text-secondary"
          >
            <ArrowLeft size={16} />
            Bộ sưu tập
          </Link>
        </div>
      </div>
    </main>
  );
}
