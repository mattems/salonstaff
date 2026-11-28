import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SalonShell } from "@/components/salon-shell";
import { api, unwrap } from "@/lib/api";
import { requireSignedIn } from "@/lib/session";

/**
 * The salon management area (`?as=employer` when signing in, D-20): hiring across every salon
 * you're on, and each salon's own pages, in a sidebar. Your salons (with their unread counts)
 * are read again on each page, so the sidebar's counts stay current.
 */
export const Route = createFileRoute("/employer")({
  beforeLoad: async ({ context, location }) => {
    const me = requireSignedIn(context.me, location.href, "employer");
    const salons = unwrap(await api.GET("/v1/employer/salons")).items;
    return { me, salons };
  },
  component: EmployerLayout,
});

function EmployerLayout() {
  const { me, salons } = Route.useRouteContext();
  return (
    <SalonShell me={me} salons={salons}>
      <Outlet />
    </SalonShell>
  );
}
