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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">Household</p>
          {identity ? (
            <p className="truncate text-xs text-foreground/70">{identity}</p>
          ) : null}
          <NetworkStatus />
          {status}
        </div>
        {actions}
      </header>
      <main className="flex-1 px-4 py-4 pb-[calc(2.75rem+env(safe-area-inset-bottom)+1rem)]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
