import { createRouter } from "@tanstack/react-router";
import { NotFound, PageError } from "./components/page";
import { serverHooks } from "./lib/server-context";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  let shownHref: string | undefined;
  return createRouter({
    routeTree,
    // Scroll positions are restored when you move between pages, not when the page you're on
    // reloads its data (`router.invalidate()`): that would pull a live conversation back up
    // from the message that just arrived.
    scrollRestoration: ({ location }) => {
      const moved = location.href !== shownHref;
      shownHref = location.href;
      return moved;
    },
    defaultPreload: "intent",
    // Loaders re-run on every visit: pages show who is signed in, and what they've done.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: PageError,
    defaultNotFoundComponent: NotFound,
    // The framework's inline scripts carry this response's nonce (src/server.ts sets the CSP).
    ssr: { nonce: serverHooks()?.current()?.nonce },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
