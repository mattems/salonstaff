/// <reference types="vite/client" />
// Before anything that builds a zod schema: no `new Function`, which the CSP blocks.
import "@salonstaff/shared/no-eval";
import { BRAND } from "@salonstaff/shared";
import { Toaster } from "@salonstaff/ui/components/sonner";
import { TooltipProvider } from "@salonstaff/ui/components/tooltip";
import { EnvironmentBadge } from "@salonstaff/ui/environment-badge";
import { createRootRoute, HeadContent, Outlet, Scripts, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { NotFound, PageError } from "@/components/page";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { currentUser } from "@/lib/session";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  beforeLoad: async () => ({ me: await currentUser() }),
  head: ({ matches }) => {
    // Any page that came up empty (an unknown address, a job that isn't there) says so.
    // `_notFound` is how the router marks a not-found handled at the root.
    const missing = matches.some(
      (match) => match.status === "notFound" || (match as { _notFound?: boolean })._notFound,
    );
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          title: missing
            ? `Page not found · ${BRAND.name}`
            : `${BRAND.name}: hair and beauty jobs in Australia`,
        },
        ...(missing ? [{ name: "robots", content: "noindex" }] : []),
        {
          name: "description",
          content:
            "Hair and beauty jobs across Australia, and a directory of salons. Apply with one profile; salons post jobs free during launch.",
        },
      ],
      links: [{ rel: "stylesheet", href: styles }],
    };
  },
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: PageError,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** The salon management area has its own frame, with a sidebar (D-20). */
const ownFrame = (pathname: string) =>
  pathname === "/employer" || pathname.startsWith("/employer/");

function RootLayout() {
  const { me } = Route.useRouteContext();
  const { pathname } = useLocation();
  if (ownFrame(pathname)) {
    return (
      <TooltipProvider>
        <Outlet />
        <Toaster />
        <EnvironmentBadge />
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <SiteHeader me={me} />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <Toaster />
      <EnvironmentBadge />
    </TooltipProvider>
  );
}
