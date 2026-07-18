import { redirect } from "next/navigation";
import { Clock3, HardDrive, Shield } from "lucide-react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import {
  formatBytes,
  getBackupConfig,
  listBackups,
} from "@/lib/system-backup";
import {
  BackupConfigForm,
  DeleteBackupButton,
  DownloadBackupButton,
  ManualBackupButton,
  RestoreBackupButton,
  UploadBackupForm,
} from "./backup-controls";

export const metadata = {
  title: "Hệ thống",
};

export default async function AdminHeThongPage() {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  if (session.user.role !== "ADMIN") redirect("/");

  const [config, backups] = await Promise.all([
    getBackupConfig(),
    listBackups(),
  ]);

  return (
    <AppShell mode="admin" isAdmin>
      <div className="min-h-screen bg-app-bg px-5 py-8 text-primary lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-xs font-bold tracking-[0.18em] text-accent-text">
              QUẢN TRỊ HỆ THỐNG
            </p>
            <h1 className="mt-2 text-3xl font-black">Hệ thống & backup</h1>
            <p className="mt-2 text-sm text-muted">
              Backup database + uploads, bật lịch tự động, và restore khi cần.
              File lưu tại{" "}
              <code className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-accent-text">
                /var/www/card-collection/backups/
              </code>
            </p>
          </header>

          <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
            <div className="space-y-4">
              <section className="rounded-2xl border border-app-border bg-surface p-5">
                <div className="flex items-center gap-2 text-accent-text">
                  <Shield size={18} />
                  <h2 className="font-black text-primary">Backup thủ công</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Tạo ngay 1 bản gồm Postgres dump + thư mục uploads.
                </p>
                <div className="mt-4 space-y-3">
                  <ManualBackupButton />
                  <UploadBackupForm />
                </div>
              </section>

              <section className="rounded-2xl border border-app-border bg-surface p-5">
                <div className="flex items-center gap-2 text-accent-text">
                  <Clock3 size={18} />
                  <h2 className="font-black text-primary">Backup tự động</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Cron trên VPS chạy mỗi ngày. Tắt ở đây để script auto bỏ qua.
                </p>
                <div className="mt-4">
                  <BackupConfigForm
                    autoEnabled={config.autoEnabled}
                    keepCount={config.keepCount}
                  />
                </div>
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-app-border bg-surface">
              <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
                <div className="flex items-center gap-2">
                  <HardDrive size={16} className="text-accent-text" />
                  <h2 className="font-black">Bản backup ({backups.length})</h2>
                </div>
              </div>
              <div className="divide-y divide-app-border">
                {backups.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted">
                    Chưa có backup nào. Bấm “Backup ngay” để tạo bản đầu tiên.
                  </p>
                ) : (
                  backups.map((backup) => (
                    <article
                      key={backup.id}
                      className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-primary">{backup.id}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              backup.trigger === "manual"
                                ? "bg-violet-500/15 text-violet-300"
                                : backup.trigger === "upload"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-sky-500/15 text-sky-300"
                            }`}
                          >
                            {backup.trigger === "manual"
                              ? "Tay"
                              : backup.trigger === "upload"
                                ? "Upload"
                                : "Auto"}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted">
                          {new Date(backup.createdAt).toLocaleString("vi-VN")} ·{" "}
                          DB {formatBytes(backup.databaseBytes)} · Uploads{" "}
                          {formatBytes(backup.uploadsBytes)} · Tổng{" "}
                          {formatBytes(backup.totalBytes)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <DownloadBackupButton backupId={backup.id} />
                        <RestoreBackupButton backupId={backup.id} />
                        <DeleteBackupButton backupId={backup.id} />
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
