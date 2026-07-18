"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  DatabaseBackup,
  Download,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import {
  deleteBackupAction,
  restoreBackupAction,
  runManualBackupAction,
  saveBackupConfigAction,
  type SystemActionState,
} from "./actions";

const initial: SystemActionState = { status: "idle", message: "" };

function useActionToast(state: SystemActionState) {
  useEffect(() => {
    if (state.status === "success") toast.success(state.message);
    if (state.status === "error") toast.error(state.message);
  }, [state]);
}

export function ManualBackupButton() {
  const [state, action] = useActionState(runManualBackupAction, initial);
  useActionToast(state);

  return (
    <form action={action}>
      <BackupSubmit label="Backup ngay" pendingLabel="Đang backup…" />
    </form>
  );
}

export function UploadBackupForm() {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".tar.gz,.tgz,application/gzip"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          startTransition(async () => {
            const body = new FormData();
            body.append("file", file);
            try {
              const response = await fetch("/api/admin/backups/upload", {
                method: "POST",
                body,
              });
              const data = (await response.json().catch(() => ({}))) as {
                error?: string;
                message?: string;
              };
              if (!response.ok) {
                toast.error(data.error ?? "Upload thất bại.");
                return;
              }
              toast.success(data.message ?? "Đã tải backup lên.");
              window.location.reload();
            } catch {
              toast.error("Không thể tải file lên.");
            }
          });
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-app-border bg-panel px-4 py-2.5 text-xs font-black text-secondary hover:bg-accent-soft hover:text-accent-text disabled:opacity-60"
      >
        <Upload size={14} />
        {pending ? "Đang tải lên…" : "Tải backup lên"}
      </button>
      <p className="text-[10px] leading-4 text-muted">
        Chọn file <code className="text-accent-text">.tar.gz</code> đã tải về
        từ hệ thống. Sau khi upload có thể bấm Restore.
      </p>
    </div>
  );
}

export function BackupConfigForm({
  autoEnabled,
  keepCount,
}: {
  autoEnabled: boolean;
  keepCount: number;
}) {
  const [state, action] = useActionState(saveBackupConfigAction, initial);
  useActionToast(state);

  return (
    <form action={action} className="space-y-4">
      <label className="flex items-center gap-3 text-sm text-primary">
        <input
          type="checkbox"
          name="autoEnabled"
          defaultChecked={autoEnabled}
          className="h-4 w-4 rounded border-app-border"
        />
        Bật backup tự động hằng ngày (03:00 UTC+7)
      </label>
      <label className="block text-xs font-bold text-muted">
        Số bản giữ lại
        <input
          type="number"
          name="keepCount"
          min={1}
          max={60}
          defaultValue={keepCount}
          className="mt-1.5 w-full rounded-lg border border-app-border bg-surface-raised px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
        />
      </label>
      <button className="inline-flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-2.5 text-xs font-black text-accent-text">
        <Save size={14} />
        Lưu cấu hình
      </button>
    </form>
  );
}

export function DownloadBackupButton({ backupId }: { backupId: string }) {
  return (
    <a
      href={`/api/admin/backups/${backupId}/download`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-panel px-2.5 py-2 text-[10px] font-bold text-secondary hover:bg-accent-soft hover:text-accent-text"
    >
      <Download size={13} />
      Tải về
    </a>
  );
}

export function RestoreBackupButton({ backupId }: { backupId: string }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [state, action] = useActionState(restoreBackupAction, initial);
  useActionToast(state);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        void (async () => {
          const ok = await confirm({
            title: "Restore hệ thống?",
            description:
              "Thao tác sẽ ghi đè database + uploads hiện tại bằng bản backup. Nên backup tay trước. App sẽ restart sau khi restore.",
            confirmLabel: "Restore",
            tone: "danger",
            confirmText: backupId,
            confirmTextLabel: (
              <>
                Gõ <span className="font-bold text-primary">{backupId}</span> để
                xác nhận
              </>
            ),
          });
          if (!ok) return;
          const formData = new FormData();
          formData.set("backupId", backupId);
          formData.set("confirm", backupId);
          startTransition(() => {
            action(formData);
          });
        })();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-2 text-[10px] font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-60"
    >
      <RotateCcw size={13} />
      {pending ? "Đang restore…" : "Restore"}
    </button>
  );
}

export function DeleteBackupButton({ backupId }: { backupId: string }) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [state, action] = useActionState(deleteBackupAction, initial);
  useActionToast(state);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        void (async () => {
          const ok = await confirm({
            title: "Xoá bản backup?",
            description: `Xoá vĩnh viễn ${backupId}. Không thể hoàn tác.`,
            confirmLabel: "Xoá backup",
            tone: "danger",
          });
          if (!ok) return;
          const formData = new FormData();
          formData.set("backupId", backupId);
          startTransition(() => {
            action(formData);
          });
        })();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/12 px-2.5 py-2 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 disabled:opacity-60"
    >
      <Trash2 size={13} />
      {pending ? "Đang xoá…" : "Xoá"}
    </button>
  );
}

function BackupSubmit({
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
      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-70"
    >
      <DatabaseBackup size={14} />
      {pending ? pendingLabel : label}
    </button>
  );
}
