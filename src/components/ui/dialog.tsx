"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type DialogProps = {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex !== -1 && !element.hasAttribute("disabled"),
  );
}

export function Dialog({ open, title, titleId, onClose, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocusRef.current = previous;

    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panel) {
        return;
      }

      const focusable = focusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[min(90dvh,40rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-sheet rounded-b-card border border-border bg-surface-elevated p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none sm:rounded-card"
      >
        <h2 id={titleId} className="text-section font-semibold tracking-tight text-pretty">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
