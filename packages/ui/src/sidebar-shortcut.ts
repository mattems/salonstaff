import { useEffect } from "react";

/**
 * Turns off the sidebar's Cmd/Ctrl+B, which shadcn's generated `SidebarProvider` listens for on
 * `window`: it also fired while making text bold. Stopped on `document`, after the page's own
 * handlers (React's are on its root) have had it, so text fields still get it.
 */
export function useNoSidebarShortcut() {
  useEffect(() => {
    const stop = (event: KeyboardEvent) => {
      if (event.key === "b" && (event.metaKey || event.ctrlKey)) event.stopPropagation();
    };
    document.addEventListener("keydown", stop);
    return () => document.removeEventListener("keydown", stop);
  }, []);
}
