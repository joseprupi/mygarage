"use client";

import { useEffect, useRef } from "react";

// Dialog focus management: on mount, move focus to the first focusable element
// inside the dialog (the close button in our modals), trap Tab/Shift+Tab within
// it, and restore focus to the triggering element on unmount.
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
    (focusables()[0] ?? dialog).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, []);

  return ref;
}
