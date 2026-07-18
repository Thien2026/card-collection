"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const themes = [
  { value: "light" as const, label: "Sáng", icon: Sun },
  { value: "dark" as const, label: "Tối", icon: Moon },
  { value: "system" as const, label: "Hệ thống", icon: Laptop },
];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePreference = theme;
  root.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial =
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
    queueMicrotask(() => {
      setTheme(initial);
      setMounted(true);
    });
    applyTheme(initial);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const syncSystem = () => {
      if ((localStorage.getItem("theme") ?? "system") === "system")
        applyTheme("system");
    };
    media.addEventListener("change", syncSystem);
    return () => media.removeEventListener("change", syncSystem);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  }

  if (compact) {
    const currentIndex = themes.findIndex(({ value }) => value === theme);
    const current = themes[currentIndex];
    const next = themes[(currentIndex + 1) % themes.length];
    const Icon = current.icon;
    const accessibleLabel = `Giao diện hiện tại: ${current.label}. Chuyển sang: ${next.label}`;

    return (
      <button
        type="button"
        onClick={() => choose(next.value)}
        aria-label={accessibleLabel}
        title={accessibleLabel}
        className={`grid h-10 w-10 place-items-center rounded-xl border border-app-border bg-panel text-secondary shadow-sm transition hover:bg-accent-soft hover:text-accent-text ${mounted ? "visible" : "invisible"}`}
      >
        <Icon size={19} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      className="flex gap-1 rounded-xl border border-app-border bg-panel p-1 shadow-sm"
      role="group"
      aria-label="Chọn giao diện"
    >
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={theme === value}
          title={label}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-bold transition ${theme === value ? "bg-accent text-white shadow-sm" : "text-text-muted hover:bg-accent-soft hover:text-accent-text"}`}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
