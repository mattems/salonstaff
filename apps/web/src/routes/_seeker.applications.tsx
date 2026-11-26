import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/page";

/** The jobs a job seeker applied for, and the ones they saved for later. */
export const Route = createFileRoute("/_seeker/applications")({
  component: Jobs,
});

const TABS = [
  { to: "/applications", label: "Applied", exact: true },
  { to: "/applications/saved", label: "Saved" },
] as const;

function Jobs() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your jobs"
        description="Where your applications are up to, and jobs you've saved."
      />
      <nav aria-label="Your jobs" className="flex gap-1 border-b pb-2">
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
    </div>
  );
}
