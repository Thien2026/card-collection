import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function BackButton({
  href,
  label = "Quay lại",
  className = "",
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-black/45 text-white shadow-sm backdrop-blur transition hover:bg-black/55 ${className}`}
    >
      <ArrowLeft size={18} strokeWidth={2.25} />
    </Link>
  );
}
