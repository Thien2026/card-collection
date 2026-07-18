import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, HardDrive } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { Pagination } from "@/components/pagination";
import { formatBytes, getUserStorageSummary } from "@/lib/upload-usage";

export const metadata = {
  title: "File",
};

const PAGE_SIZE = 12;

export default async function AdminFilePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/dang-nhap");
  if (session.user.role !== "ADMIN") redirect("/");

  const query = await searchParams;
  const requestedPage = positiveInt(query.page);
  const userCount = await prisma.user.count();
  const totalPages = Math.max(1, Math.ceil(userCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });

  const summaries = await Promise.all(
    users.map(async (user) => ({
      user,
      storage: await getUserStorageSummary(user.id),
    })),
  );

  const pageBytes = summaries.reduce(
    (sum, item) => sum + item.storage.bytes,
    0,
  );
  const pageFiles = summaries.reduce(
    (sum, item) => sum + item.storage.files,
    0,
  );

  return (
    <AppShell mode="admin" isAdmin>
      <div className="min-h-screen bg-app-bg px-5 py-8 text-primary lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-xs font-bold tracking-[0.18em] text-accent-text">
              QUẢN TRỊ HỆ THỐNG
            </p>
            <h1 className="mt-2 text-3xl font-black">File & dung lượng</h1>
            <p className="mt-2 text-sm text-muted">
              Xem thư mục upload theo từng user, theo dõi dung lượng và dọn
              dữ liệu không cần thiết.
            </p>
          </header>

          <section className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Dung lượng (trang này)"
              value={formatBytes(pageBytes)}
              icon={<HardDrive size={18} />}
            />
            <StatCard
              label="File (trang này)"
              value={String(pageFiles)}
              icon={<FolderOpen size={18} />}
            />
            <StatCard
              label="Người dùng"
              value={String(userCount)}
              icon={<HardDrive size={18} />}
            />
          </section>

          <section className="overflow-hidden rounded-2xl border border-app-border bg-surface">
            <div className="border-b border-app-border px-5 py-4">
              <h2 className="font-black">Theo người dùng</h2>
            </div>
            <div className="divide-y divide-app-border">
              {summaries.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted">
                  Chưa có user nào.
                </p>
              ) : (
                summaries.map(({ user, storage }) => (
                  <article
                    key={user.id}
                    className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-bold text-primary">
                          {user.name}
                        </p>
                        <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-300">
                          {user.role}
                        </span>
                        {user.deletedAt ? (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold text-rose-300">
                            Đã xoá
                          </span>
                        ) : user.status === "SUSPENDED" ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-300">
                            Đình chỉ
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted">
                        {user.email}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {storage.folders.length === 0 ? (
                          <span className="rounded-lg bg-panel px-2 py-1 text-[10px] text-muted">
                            Chưa có thư mục upload
                          </span>
                        ) : (
                          storage.folders.slice(0, 4).map((folder) => (
                            <span
                              key={folder.name}
                              className="rounded-lg bg-panel px-2 py-1 text-[10px] font-bold text-secondary"
                            >
                              {folder.name}: {formatBytes(folder.bytes)}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-black text-accent-text">
                          {formatBytes(storage.bytes)}
                        </p>
                        <p className="text-[10px] text-muted">
                          {storage.files} file
                        </p>
                      </div>
                      <Link
                        href={`/admin/file/${user.id}`}
                        className="rounded-xl bg-accent-soft px-3 py-2 text-[10px] font-bold text-accent-text hover:bg-violet-500/20"
                      >
                        Xem folder
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
            <div className="px-5 pb-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                basePath="/admin/file"
              />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-surface p-4">
      <div className="flex items-center gap-2 text-accent-text">{icon}</div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-primary">{value}</p>
    </div>
  );
}

function positiveInt(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}
