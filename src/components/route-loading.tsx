import Image from "next/image";
import { LOGO_SRC } from "@/lib/brand";

export function RouteLoading({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="fixed inset-0 z-40 grid place-items-center bg-app-bg px-6"
    >
      <div className="text-center">
        <div className="cc-route-pending relative mx-auto h-[86px] w-[86px]">
          <Image
            src={LOGO_SRC}
            alt=""
            fill
            sizes="86px"
            className="object-contain"
            priority
            unoptimized
          />
        </div>
        <p className="mt-3 text-[10px] font-bold text-muted">{label}</p>
      </div>
    </div>
  );
}
