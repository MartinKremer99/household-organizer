import type { ReactNode } from "react";
import { NetworkStatus } from "@/features/network/ui/network-status";
import { BottomNav } from "./bottom-nav";

export type AppShellProps = {
  actions?: ReactNode;
  status?: ReactNode;
  identity?: string | null;
  children: ReactNode;
};

export function AppShell({ actions, status, identity, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-lg flex-col overflow-x-hidden">
      <header
        aria-label="Household"
        className="min-w-0 border-b border-border bg-surface pt-[env(safe-area-inset-top)]"
      >
        <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-card font-medium">
            {identity ?? "Household"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {status}
            {actions}
          </div>
        </div>
        <NetworkStatus />
      </header>
      <main className="flex-1 px-4 py-3 pb-[calc(3.75rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
