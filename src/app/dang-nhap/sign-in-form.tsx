"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { LOGO_SRC } from "@/lib/brand";
import { authenticate, type SignInState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="mt-5 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-[0_10px_28px_rgba(109,74,255,0.3)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Đang đăng nhập…" : "Đăng nhập"}
    </button>
  );
}

export function SignInForm({ notice }: { notice?: string }) {
  const [state, formAction] = useActionState<SignInState, FormData>(authenticate, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-[480px]">
      <div className="relative z-20 mb-5 text-center sm:mb-7">
        <div className="relative mx-auto h-16 w-16 overflow-hidden rounded-[20px] border border-violet-300/50 shadow-[0_0_34px_rgba(121,82,255,0.45),inset_0_1px_0_rgba(255,255,255,0.3)] sm:h-[72px] sm:w-[72px] sm:rounded-[22px]">
          <Image
            src={LOGO_SRC}
            alt="Card Collection"
            fill
            sizes="72px"
            className="object-contain"
            priority
            unoptimized
          />
        </div>
        <p className="mt-3 text-[1.9rem] font-black leading-none tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)] sm:mt-4 sm:text-[2.15rem]">Card <span className="text-violet-400">Collection</span></p>
        <p className="mt-2 text-xs text-slate-300 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)] sm:mt-3">Lưu giữ · Sắp xếp · Kết nối đam mê</p>
      </div>

      <form action={formAction} className="rounded-[22px] border border-white/[0.13] bg-slate-950/65 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl sm:p-7">
        <h1 className="text-[1.55rem] font-bold text-white">Chào mừng trở lại!</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Đăng nhập để tiếp tục quản lý bộ sưu tập của bạn. ✨</p>
        {notice ? (
          <p
            className="mt-4 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-slate-200">
          Email
          <span className="relative mt-2 block">
            <Mail aria-hidden="true" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input name="email" type="email" required autoComplete="email" placeholder="Nhập email" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20" />
          </span>
        </label>
        <label className="mt-5 block text-sm font-medium text-slate-200">
          Mật khẩu
          <span className="relative mt-2 block">
            <LockKeyhole aria-hidden="true" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Nhập mật khẩu" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-500/20" />
            <button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {state.error ? <p className="mt-4 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200" role="alert" aria-live="polite">{state.error}</p> : null}
        <SubmitButton />
        <p className="mt-5 border-t border-white/[0.08] pt-5 text-center text-xs leading-5 text-slate-500">Chưa có tài khoản? Liên hệ quản trị viên để được cấp.</p>
      </form>
    </div>
  );
}
