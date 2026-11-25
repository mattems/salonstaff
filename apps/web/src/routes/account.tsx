import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { requireSignedIn } from "@/lib/session";

/** A job seeker's own pages. Employer accounts have their dashboard instead. */
export const Route = createFileRoute("/account")({
  beforeLoad: ({ context, location }) => {
    const me = requireSignedIn(context.me, location.href);
    if (me.role === "employer") throw redirect({ to: "/employer" });
    return { me };
  },
  component: AccountLayout,
});

const TABS = [
  { to: "/account", label: "Profile", exact: true },
  { to: "/account/profile", label: "Preview" },
  { to: "/account/verify", label: "Verification" },
  { to: "/account/applications", label: "Applications" },
  { to: "/account/saved", label: "Saved jobs" },
] as const;

function AccountLayout() {
  return (
    <Page width="wide">
      <nav aria-label="Your account" className="mb-6 flex flex-wrap gap-1 border-b pb-2">
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
      <Outlet />
    </Page>
  );
}
