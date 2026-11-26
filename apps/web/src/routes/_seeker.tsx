import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { requireSignedIn } from "@/lib/session";

/**
 * A job seeker's own full-width pages, apart from their profile: the inbox and their jobs.
 * Employer accounts have their dashboard instead.
 */
export const Route = createFileRoute("/_seeker")({
  beforeLoad: ({ context, location }) => {
    const me = requireSignedIn(context.me, location.href);
    if (me.role === "employer") throw redirect({ to: "/employer" });
    return { me };
  },
  component: () => (
    <Page width="wide">
      <Outlet />
    </Page>
  ),
});
