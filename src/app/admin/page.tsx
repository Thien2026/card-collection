import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { Pagination } from "@/components/pagination";
import {
  CreateUserForm,
  UserLifecycleActions,
  UserRoleSelect,
} from "./user-manager";

const PAGE_SIZE = 12;

export default async function AdminPage({
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
    orderBy: [{ deletedAt: "asc" }, { role: "asc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      deletedAt: true,
      createdAt: true,
      _count: { select: { inventoryItems: true } },
    },
  });

  return (
    <AppShell mode="admin" isAdmin>
      <div className="min-h-screen bg-app-bg px-5 py-8 text-primary lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8">
            <p className="text-xs font-bold tracking-[0.18em] text-accent-text">
              QUẢN TRỊ HỆ THỐNG
            </p>
            <h1 className="mt-2 text-3xl font-black">Quản lý người dùng</h1>
            <p className="mt-2 text-sm text-muted">
              Tạo tài khoản, phân quyền, đình chỉ hoặc xoá mềm người dùng.
            </p>
          </header>
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <CreateUserForm />
            <section className="overflow-hidden rounded-2xl border border-app-border bg-surface">
              <div className="border-b border-app-border px-5 py-4">
                <h2 className="font-black">Người dùng ({userCount})</h2>
              </div>
              <div className="divide-y divide-app-border">
                {users.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted">
                    Chưa có user nào.
                  </p>
                ) : (
                  users.map((user) => (
                    <article
                      className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between ${
                        user.deletedAt ? "opacity-70" : ""
                      }`}
                      key={user.id}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-bold text-primary">
                            {user.name}
                          </p>
                          <RoleBadge role={user.role} />
                          <StatusBadge
                            status={user.status}
                            deletedAt={user.deletedAt}
                          />
                          {user.id === session.user.id ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                              Bạn
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted">
                          {user.email}
                        </p>
                        <p className="mt-2 text-[10px] text-muted">
                          {user._count.inventoryItems} mục trong kho
                        </p>
                      </div>
                      <div className="flex flex-col items-stretch gap-3 sm:items-end">
                        <UserRoleSelect
                          userId={user.id}
                          role={user.role}
                          disabled={Boolean(user.deletedAt)}
                        />
                        <UserLifecycleActions
                          userId={user.id}
                          email={user.email}
                          status={user.status}
                          deletedAt={
                            user.deletedAt ? user.deletedAt.toISOString() : null
                          }
                          isSelf={user.id === session.user.id}
                        />
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className="px-5 pb-4">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  basePath="/admin"
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function RoleBadge({ role }: { role: "ADMIN" | "USER" }) {
  const isAdmin = role === "ADMIN";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        isAdmin
          ? "bg-violet-500/15 text-violet-300"
          : "bg-slate-500/15 text-slate-300"
      }`}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function StatusBadge({
  status,
  deletedAt,
}: {
  status: "ACTIVE" | "SUSPENDED";
  deletedAt: Date | null;
}) {
  if (deletedAt) {
    return (
      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-300">
        Đã xoá
      </span>
    );
  }
  if (status === "SUSPENDED") {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
        Đình chỉ
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
      Hoạt động
    </span>
  );
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
