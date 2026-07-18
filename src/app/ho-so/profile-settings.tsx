"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import {
  changePassword,
  updateProfile,
  type ProfileActionState,
} from "./actions";

const initialState: ProfileActionState = { status: "idle", message: "" };

export function ProfileSettings({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [profileState, profileAction] = useActionState(
    updateProfile,
    initialState,
  );
  const [passwordState, passwordAction] = useActionState(
    changePassword,
    initialState,
  );
  const passwordForm = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (profileState.status === "success") toast.success(profileState.message);
    if (profileState.status === "error") toast.error(profileState.message);
  }, [profileState]);

  useEffect(() => {
    if (passwordState.status === "success") {
      toast.success(passwordState.message);
      passwordForm.current?.reset();
    }
    if (passwordState.status === "error") toast.error(passwordState.message);
  }, [passwordState]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-3xl border border-app-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <Save size={18} />
          </span>
          <div>
            <h2 className="text-sm font-black text-primary">
              Thông tin tài khoản
            </h2>
            <p className="mt-0.5 text-[9px] text-muted">
              Cập nhật tên hiển thị của bạn.
            </p>
          </div>
        </div>
        <form action={profileAction} className="mt-5 space-y-3">
          <Field
            label="Tên hiển thị"
            name="name"
            defaultValue={name}
            minLength={2}
            maxLength={60}
            required
          />
          <Field
            label="Email đăng nhập"
            name="email"
            defaultValue={email}
            disabled
          />
          <SubmitButton label="Lưu thay đổi" pendingLabel="Đang lưu…" />
        </form>
      </section>

      <section className="rounded-3xl border border-app-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <KeyRound size={18} />
          </span>
          <div>
            <h2 className="text-sm font-black text-primary">Đổi mật khẩu</h2>
            <p className="mt-0.5 text-[9px] text-muted">
              Mật khẩu mới cần ít nhất 8 ký tự.
            </p>
          </div>
        </div>
        <form
          ref={passwordForm}
          action={passwordAction}
          className="mt-5 space-y-3"
        >
          <Field
            label="Mật khẩu hiện tại"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Mật khẩu mới"
              name="newPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
            <Field
              label="Nhập lại mật khẩu"
              name="confirmPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </div>
          <SubmitButton label="Đổi mật khẩu" pendingLabel="Đang đổi…" />
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block">
      <span className="text-[9px] font-bold text-muted">{label}</span>
      <input
        {...props}
        className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-3 text-xs text-primary outline-none disabled:cursor-not-allowed disabled:opacity-60 focus:border-violet-400"
      />
    </label>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="w-full rounded-xl bg-accent px-4 py-3 text-xs font-black text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
