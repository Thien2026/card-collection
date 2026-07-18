"use client";

import type { ReactNode } from "react";

export function ScrollToSectionButton({
  targetId,
  icon,
  label,
  hint,
}: {
  targetId: string;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  function scrollToTarget() {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.location.hash !== `#${targetId}`) {
      window.history.replaceState(null, "", `#${targetId}`);
    }
  }

  return (
    <button
      type="button"
      onClick={scrollToTarget}
      className="rounded-2xl border border-app-border bg-surface p-3 text-left transition hover:border-violet-400/50 sm:p-4"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent-text">
        {icon}
      </span>
      <p className="mt-2 text-xs font-black text-primary">{label}</p>
      <p className="mt-0.5 text-[9px] text-muted">{hint}</p>
    </button>
  );
}
