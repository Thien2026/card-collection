"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** GitHub-style: user must type this exact text to enable confirm */
  confirmText?: string;
  confirmTextLabel?: ReactNode;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState("");
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
    setTyped("");
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setTyped("");
      setOptions(next);
    });
  }, []);

  useEffect(() => {
    if (!options) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKeyDown);
    if (options.confirmText) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("keydown", onKeyDown);
      };
    }
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options, close]);

  const matchesConfirmText =
    !options?.confirmText || typed === options.confirmText;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
            onClick={() => close(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative z-10 w-full max-w-md rounded-2xl border border-app-border bg-surface p-5 shadow-2xl shadow-[var(--shadow)] sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  options.tone === "default"
                    ? "bg-accent-soft text-accent-text"
                    : "bg-rose-500/15 text-rose-500"
                }`}
              >
                <AlertTriangle size={22} strokeWidth={2.2} />
              </span>
              <h2
                id={titleId}
                className="pt-2 text-base font-black text-primary sm:text-lg"
              >
                {options.title}
              </h2>
            </div>

            <div
              id={descriptionId}
              className="mt-4 space-y-2 text-sm leading-6 text-secondary"
            >
              {options.description
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>

            {options.confirmText && (
              <div className="mt-5">
                <label
                  htmlFor={`${titleId}-confirm`}
                  className="block text-sm font-semibold text-secondary"
                >
                  {options.confirmTextLabel ?? (
                    <>
                      Nhập{" "}
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-black text-rose-600">
                        {options.confirmText}
                      </span>{" "}
                      để xác nhận xoá
                    </>
                  )}
                </label>
                <input
                  ref={inputRef}
                  id={`${titleId}-confirm`}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && matchesConfirmText) {
                      event.preventDefault();
                      close(true);
                    }
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={options.confirmText}
                  className="mt-2 w-full rounded-xl border border-app-border bg-panel px-3 py-2.5 text-sm font-semibold text-primary outline-none ring-rose-500/40 placeholder:text-muted focus:border-rose-400 focus:ring-2"
                />
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-xl border border-app-border bg-panel px-4 py-2.5 text-sm font-bold text-secondary transition hover:bg-accent-soft hover:text-primary"
              >
                {options.cancelLabel ?? "Huỷ"}
              </button>
              <button
                type="button"
                disabled={!matchesConfirmText}
                onClick={() => close(true)}
                className={`rounded-xl px-4 py-2.5 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  options.tone === "default"
                    ? "bg-accent hover:brightness-110"
                    : "bg-rose-600 hover:bg-rose-500"
                }`}
              >
                {options.confirmLabel ?? "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm phải dùng trong ConfirmProvider");
  }
  return context.confirm;
}
