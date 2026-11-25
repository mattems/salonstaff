import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { requireSignedIn } from "@/lib/session";

/** A salon's own pages. Signing in here is the salon side (`?as=employer`). */
export const Route = createFileRoute("/employer")({
  beforeLoad: ({ context, location }) => ({
    me: requireSignedIn(context.me, location.href, "employer"),
  }),
  component: EmployerLayout,
});

const TABS = [
  { to: "/employer", label: "Dashboard", exact: true },
  { to: "/employer/jobs/new", label: "Post a job" },
  { to: "/employer/billing", label: "Billing" },
  { to: "/employer/settings", label: "Salon details" },
] as const;

function EmployerLayout() {
  const { me } = Route.useRouteContext();
  const onboarding = useLocation({
    select: (location) => location.pathname === "/employer/onboarding",
  });
  return (
    <Page width="wide">
      {me.salon && !onboarding && (
        <nav
          aria-label="Your salon"
          className="mb-6 flex flex-wrap items-center gap-1 border-b pb-2"
        >
          <span className="mr-2 font-medium text-sm">{me.salon.name}</span>
          {TABS.map((tab) => (
            <Button key={tab.to} asChild variant="ghost" size="sm">
              <Link
                to={tab.to}
                activeOptions={{ exact: "exact" in tab }}
                activeProps={{ className: "bg-muted" }}
              >
                {tab.label}
              </Link>
            </Button>
          ))}
        </nav>
      )}
      <Outlet />
    </Page>
  );
}
