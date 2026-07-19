"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, MapPin, Phone, Plus, Search, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { formatVnd } from "@/lib/format";
import { Pagination } from "@/components/pagination";
import { createCustomer } from "./actions";

type CustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  orderCount: number;
  totalSpent: number;
};

export function CustomerManager({
  initialCustomers,
  totalCustomers,
  currentPage,
  totalPages,
  query,
}: {
  initialCustomers: CustomerSummary[];
  totalCustomers: number;
  currentPage: number;
  totalPages: number;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const created = await createCustomer(formData);
        setOpen(false);
        toast.success(`Đã thêm khách hàng “${created.name}”`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Không thể tạo khách hàng.",
        );
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-primary">Khách hàng</h1>
          <p className="mt-1 text-xs text-muted">
            {totalCustomers} khách hàng phù hợp
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-violet-950/20"
        >
          <Plus size={16} />
          Thêm khách hàng
        </button>
      </div>

      <form className="relative mt-5">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          name="q"
          defaultValue={query}
          placeholder="Tìm tên, số điện thoại, email..."
          className="w-full rounded-xl border border-app-border bg-surface py-3 pl-9 pr-3 text-xs text-primary outline-none focus:border-violet-400"
        />
      </form>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {initialCustomers.length === 0 ? (
          <div className="col-span-full rounded-3xl border border-dashed border-app-border-strong bg-surface p-10 text-center">
            <UserRound
              size={26}
              className="mx-auto text-accent-text"
            />
            <p className="mt-3 text-sm font-black text-primary">
              Chưa tìm thấy khách hàng
            </p>
            <p className="mt-1 text-xs text-muted">
              Tạo khách mới để chọn nhanh khi bán hàng.
            </p>
          </div>
        ) : (
          initialCustomers.map((customer) => (
            <Link
              key={customer.id}
              href={`/ban-hang/khach-hang/${customer.id}`}
              className="rounded-2xl border border-app-border bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <UserRound size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-black text-primary">
                    {customer.name}
                  </h2>
                  <div className="mt-2 space-y-1 text-[10px] text-muted">
                    {customer.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone size={11} />
                        {customer.phone}
                      </p>
                    )}
                    {customer.email && (
                      <p className="flex items-center gap-1.5 truncate">
                        <Mail size={11} />
                        {customer.email}
                      </p>
                    )}
                    {customer.address && (
                      <p className="flex items-center gap-1.5 truncate">
                        <MapPin size={11} />
                        {customer.address}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-app-border pt-3">
                <div>
                  <p className="text-[9px] text-muted">Đơn hoàn tất</p>
                  <p className="mt-0.5 text-xs font-black text-primary">
                    {customer.orderCount}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted">Đã mua</p>
                  <p className="mt-0.5 truncate text-xs font-black text-primary">
                    {formatVnd(customer.totalSpent)}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/ban-hang/khach-hang"
        params={{ q: query || undefined }}
      />

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
          />
          <form
            action={submit}
            className="relative z-10 w-full max-w-md rounded-2xl border border-app-border bg-surface p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-primary">
                  Thêm khách hàng
                </h2>
                <p className="mt-1 text-[10px] text-muted">
                  Có thể bổ sung thông tin còn thiếu sau.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-panel text-muted"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field name="name" label="Tên khách hàng *" required />
              <Field name="phone" label="Số điện thoại" />
              <Field name="email" label="Email" type="email" />
              <Field name="address" label="Địa chỉ" />
            </div>
            <label className="mt-3 block">
              <span className="text-[10px] font-bold text-muted">Ghi chú</span>
              <textarea
                name="notes"
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-app-border bg-panel px-4 py-2.5 text-xs font-black text-secondary"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-accent px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
              >
                {pending ? "Đang lưu…" : "Thêm khách"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-muted">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1.5 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm text-primary outline-none focus:border-violet-400"
      />
    </label>
  );
}
