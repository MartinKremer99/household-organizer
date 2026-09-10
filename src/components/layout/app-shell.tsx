import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export type AppShellProps = {
  actions?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
};

export function AppShell({ actions, status, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">Household</p>
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
