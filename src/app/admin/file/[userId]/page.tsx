import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, ExternalLink, FileIcon, Folder } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { Pagination } from "@/components/pagination";
import {
  formatBytes,
  getUserStorageSummary,
  listStorageEntries,
} from "@/lib/upload-usage";
import { ClearTmpButton, DeletePathButton } from "../file-actions";

export const metadata = {
  title: "Chi tiết file user",
};

const IMAGE_EXT = /\.(webp|png|jpe?g|gif|avif)$/i;
const PAGE_SIZE = 40;

export default async function AdminUserFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ path?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  if (session.user.role !== "ADMIN") redirect("/");

  const { userId } = await params;
  const query = await searchParams;
  const relativePath = String(query.path ?? "").trim();
  const requestedPage =
    query.page && /^\d+$/.test(query.page) ? Math.max(1, Number(query.page)) : 1;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });
  if (!user) notFound();

  let allEntries;
  let summary;
  try {
    allEntries = await listStorageEntries(userId, relativePath);
    summary = await getUserStorageSummary(userId);
  } catch {
    notFound();
  }

  const totalPages = Math.max(1, Math.ceil(allEntries.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const entries = allEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const crumbs = relativePath ? relativePath.split("/").filter(Boolean) : [];
  const basePath = `/admin/file/${user.id}`;
  const pathParam = relativePath || undefined;

  return (
    <AppShell mode="admin" isAdmin>
      <div className="min-h-screen bg-app-bg px-5 py-8 text-primary lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                href="/admin/file"
                className="text-xs font-bold text-accent-text hover:underline"
              >
                ← Tất cả user
              </Link>
              <h1 className="mt-2 text-3xl font-black">{user.name}</h1>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
              <p className="mt-3 text-xs text-secondary">
                Tổng:{" "}
                <span className="font-black text-accent-text">
                  {formatBytes(summary.bytes)}
                </span>{" "}
                · {summary.files} file
              </p>
            </div>
            <ClearTmpButton userId={user.id} />
          </header>

          <nav className="mb-4 flex flex-wrap items-center gap-1 text-[11px] font-bold text-muted">
            <Link
              href={`/admin/file/${user.id}`}
              className="rounded-lg px-2 py-1 hover:bg-accent-soft hover:text-accent-text"
            >
              root
            </Link>
            {crumbs.map((crumb, index) => {
              const pathValue = crumbs.slice(0, index + 1).join("/");
              return (
                <span key={pathValue} className="flex items-center gap-1">
                  <ChevronRight size={12} />
                  <Link
                    href={`/admin/file/${user.id}?path=${encodeURIComponent(pathValue)}`}
                    className="rounded-lg px-2 py-1 hover:bg-accent-soft hover:text-accent-text"
                  >
                    {crumb}
                  </Link>
                </span>
              );
            })}
          </nav>

          <section className="overflow-hidden rounded-2xl border border-app-border bg-surface">
            <div className="border-b border-app-border px-5 py-4">
              <h2 className="font-black">
                {relativePath ? relativePath : "Thư mục gốc"}
                <span className="ml-2 text-xs font-bold text-muted">
                  ({allEntries.length})
                </span>
              </h2>
            </div>
            <div className="divide-y divide-app-border">
              {entries.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted">
                  Thư mục trống hoặc chưa có dữ liệu upload.
                </p>
              ) : (
                entries.map((entry) => {
                  const fileUrl = `/api/uploads/users/${user.id}/${entry.relativePath
                    .split("/")
                    .map(encodeURIComponent)
                    .join("/")}`;
                  const isImage =
                    entry.kind === "file" && IMAGE_EXT.test(entry.name);

                  return (
                    <article
                      key={entry.relativePath}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {isImage ? (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="relative mt-0.5 h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-app-border bg-panel"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={fileUrl}
                              alt={entry.name}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ) : (
                          <span className="mt-0.5 grid h-14 w-14 place-items-center rounded-xl bg-accent-soft text-accent-text">
                            {entry.kind === "directory" ? (
                              <Folder size={18} />
                            ) : (
                              <FileIcon size={18} />
                            )}
                          </span>
                        )}
                        <div className="min-w-0">
                          {entry.kind === "directory" ? (
                            <Link
                              href={`/admin/file/${user.id}?path=${encodeURIComponent(entry.relativePath)}`}
                              className="truncate font-bold text-primary hover:text-accent-text"
                            >
                              {entry.name}
                            </Link>
                          ) : (
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate font-bold text-primary hover:text-accent-text"
                            >
                              {entry.name}
                            </a>
                          )}
                          <p className="mt-1 text-[10px] text-muted">
                            {formatBytes(entry.bytes)}
                            {entry.kind === "directory"
                              ? ` · ${entry.files} file`
                              : ""}
                            {entry.updatedAt
                              ? ` · ${new Date(entry.updatedAt).toLocaleString("vi-VN")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {entry.kind === "file" ? (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-app-border bg-panel px-2.5 py-2 text-[10px] font-bold text-secondary hover:bg-accent-soft hover:text-accent-text"
                          >
                            <ExternalLink size={13} />
                            Mở
                          </a>
                        ) : null}
                        <DeletePathButton
                          userId={user.id}
                          relativePath={entry.relativePath}
                          label={entry.name}
                          kind={entry.kind}
                        />
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <div className="px-5 pb-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath={basePath}
                params={{ path: pathParam }}
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
