"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Ban, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import {
  createUserAction,
  restoreUserAction,
  softDeleteUserAction,
  suspendUserAction,
  unsuspendUserAction,
  updateUserRoleAction,
  type AdminActionState,
} from "./actions";

const adminActionInitial: AdminActionState = { status: "idle", message: "" };

const ROLES = [
  { value: "USER", label: "User" },
  { value: "ADMIN", label: "Admin" },
] as const;

export function CreateUserForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(createUserAction, adminActionInitial);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      formRef.current?.reset();
    }
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="h-fit rounded-2xl border border-app-border bg-surface p-5"
    >
      <h2 className="font-black text-primary">Tạo tài khoản mới</h2>
      <p className="mt-1 text-xs text-muted">
        Chọn role khi tạo: User dùng app, Admin vào khu vực quản trị.
      </p>
      <div className="mt-5 space-y-4">
        <Field name="name" label="Tên hiển thị" required minLength={2} />
        <Field name="email" label="Email" type="email" required />
        <Field
          name="password"
          label="Mật khẩu (tối thiểu 8 ký tự)"
          type="password"
          minLength={8}
          required
        />
        <label className="block text-xs font-bold text-muted">
          Role
          <select
            name="role"
            defaultValue="USER"
            className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
          >
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
        <SubmitButton label="Tạo tài khoản" pendingLabel="Đang tạo…" />
      </div>
    </form>
  );
}

export function UserRoleSelect({
  userId,
  role,
  disabled = false,
}: {
  userId: string;
  role: string;
  disabled?: boolean;
}) {
  const [state, action] = useActionState(
    updateUserRoleAction,
    adminActionInitial,
  );

  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="userId" value={userId} />
      <label className="block text-right text-[10px] font-bold text-muted">
        Role
        <select
          name="role"
          defaultValue={role}
          disabled={disabled}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="mt-1 block min-w-[7.5rem] rounded-lg border border-app-border bg-surface-raised px-2.5 py-2 text-xs font-bold text-primary outline-none focus:border-violet-400 disabled:opacity-60"
        >
          {ROLES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

export function UserLifecycleActions({
  userId,
  email,
  status,
  deletedAt,
  isSelf,
}: {
  userId: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  deletedAt: string | null;
  isSelf: boolean;
}) {
  const confirm = useConfirm();
  const [suspendState, suspendAction] = useActionState(
    suspendUserAction,
    adminActionInitial,
  );
  const [unsuspendState, unsuspendAction] = useActionState(
    unsuspendUserAction,
    adminActionInitial,
  );
  const [deleteState, deleteAction] = useActionState(
    softDeleteUserAction,
    adminActionInitial,
  );
  const [restoreState, restoreAction] = useActionState(
    restoreUserAction,
    adminActionInitial,
  );

  useEffect(() => {
    for (const state of [suspendState, unsuspendState, deleteState, restoreState]) {
      if (state.status === "success") toast.success(state.message);
      if (state.status === "error") toast.error(state.message);
    }
  }, [suspendState, unsuspendState, deleteState, restoreState]);

  if (isSelf) {
    return (
      <p className="text-right text-[10px] text-muted">
        Không thể tự đình chỉ / xoá
      </p>
    );
  }

  if (deletedAt) {
    return (
      <form action={restoreAction}>
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-2 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25"
        >
          <Undo2 size={13} />
          Khôi phục
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "SUSPENDED" ? (
        <form action={unsuspendAction}>
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-2 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25"
          >
            <RotateCcw size={13} />
            Mở lại
          </button>
        </form>
      ) : (
        <form
          action={async (formData) => {
            const ok = await confirm({
              title: "Đình chỉ tài khoản?",
              description: `${email} sẽ không đăng nhập được cho đến khi được mở lại. Dữ liệu vẫn được giữ.`,
              confirmLabel: "Đình chỉ",
              tone: "danger",
            });
            if (ok) suspendAction(formData);
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-2 text-[10px] font-bold text-amber-400 hover:bg-amber-500/25"
          >
            <Ban size={13} />
            Đình chỉ
          </button>
        </form>
      )}

      <form
        action={async (formData) => {
          const ok = await confirm({
            title: "Xoá mềm tài khoản?",
            description: `${email} sẽ bị ẩn khỏi đăng nhập. Có thể khôi phục sau. Dữ liệu bộ sưu tập vẫn giữ.`,
            confirmLabel: "Xoá mềm",
            tone: "danger",
            confirmText: email,
            confirmTextLabel: (
              <>
                Gõ <span className="font-bold text-primary">{email}</span> để xác
                nhận
              </>
            ),
          });
          if (ok) deleteAction(formData);
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/12 px-2.5 py-2 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
        >
          <Trash2 size={13} />
          Xoá
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  ...props
}: React.ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block text-xs font-bold text-muted">
      {label}
      <input
        {...props}
        className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
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
      className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-70"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export type { AdminActionState };
