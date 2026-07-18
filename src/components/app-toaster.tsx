"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      theme="system"
      toastOptions={{
        classNames: {
          toast:
            "border border-app-border bg-surface text-primary shadow-xl shadow-[var(--shadow)]",
          title: "font-bold text-primary",
          description: "text-secondary",
          closeButton: "border-app-border bg-panel text-muted",
        },
      }}
    />
  );
}
