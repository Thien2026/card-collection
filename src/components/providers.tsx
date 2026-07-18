"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "./confirm-dialog";
import { AppToaster } from "./app-toaster";
import { StartupSplash } from "./startup-splash";
import { NavigationPending } from "./navigation-pending";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <StartupSplash />
      <NavigationPending>
        {children}
      </NavigationPending>
      <AppToaster />
    </ConfirmProvider>
  );
}
