"use client";

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RouteLoading } from "./route-loading";

const SHOW_DELAY_MS = 120;
const MAX_PENDING_MS = 10000;

const MarkPendingContext = createContext<() => void>(() => {});

export function useMarkNavigationPending() {
  return useContext(MarkPendingContext);
}

function NavigationPendingWatcher({
  pending,
  setPending,
}: {
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    setPending(false);
  }, [routeKey, setPending]);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const showTimer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    const failsafe = window.setTimeout(() => setPending(false), MAX_PENDING_MS);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(failsafe);
    };
  }, [pending, setPending]);

  useEffect(() => {
    function sameDestination(href: string) {
      try {
        const next = new URL(href, window.location.href);
        if (next.origin !== window.location.origin) return true;
        return (
          next.pathname === window.location.pathname &&
          next.search === window.location.search
        );
      } catch {
        return true;
      }
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (href.startsWith("tel:") || href.startsWith("javascript:")) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (sameDestination(href)) return;
      setPending(true);
    }

    function onSubmit(event: Event) {
      // Bubble phase: React form/Server Actions call preventDefault first.
      // Capture-phase listening incorrectly treated them as route navigations,
      // leaving the full-screen loader stuck until the 10s failsafe.
      if (event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const method = (form.getAttribute("method") || "get").toLowerCase();
      if (method !== "get") return;
      setPending(true);
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, [setPending]);

  if (!visible) return null;
  return <RouteLoading />;
}

export function NavigationPending({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);
  const markPending = useCallback(() => setPending(true), []);

  return (
    <MarkPendingContext.Provider value={markPending}>
      {children}
      <Suspense fallback={null}>
        <NavigationPendingWatcher pending={pending} setPending={setPending} />
      </Suspense>
    </MarkPendingContext.Provider>
  );
}
