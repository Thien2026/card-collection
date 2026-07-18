"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LOGO_SRC } from "@/lib/brand";

export function StartupSplash() {
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => setClosing(true), 1450);
    const hideTimer = window.setTimeout(() => setVisible(false), 1700);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Đang khởi động Card Collection"
      className={`fixed inset-0 z-[9999] grid place-items-center bg-app-bg px-6 transition-opacity duration-300 ${
        closing ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="text-center">
        <div className="cc-loading-mark relative mx-auto h-20 w-20">
          <Image
            src={LOGO_SRC}
            alt=""
            fill
            sizes="80px"
            className="object-contain"
            priority
            unoptimized
          />
        </div>
        <p className="mt-4 text-sm font-black text-primary">Card Collection</p>
        <p className="mt-1 text-[9px] text-muted">Đang chuẩn bị bộ sưu tập…</p>
        <div className="relative mx-auto mt-6 h-2 w-60 rounded-full bg-panel">
          <div className="cc-startup-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-violet-400 to-fuchsia-400" />
          <span className="cc-startup-runner absolute -top-3 h-8 w-8">
            <Image
              src={LOGO_SRC}
              alt=""
              fill
              sizes="32px"
              className="object-contain drop-shadow-[0_0_9px_rgba(139,92,246,0.75)]"
              priority
              unoptimized
            />
          </span>
        </div>
      </div>
    </div>
  );
}
