import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export type AppShellProps = {
  actions?: ReactNode;
  children: ReactNode;
};

export function AppShell({ actions, children }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col overflow-x-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-foreground/15 px-4 py-3">
        <p className="text-sm font-medium">Household</p>
        {actions}
      </header>
      <main className="flex-1 px-4 py-4 pb-[calc(2.75rem+env(safe-area-inset-bottom)+1rem)]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
