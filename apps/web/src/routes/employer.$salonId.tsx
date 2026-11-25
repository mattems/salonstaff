import { Button } from "@salonstaff/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@salonstaff/ui/components/dropdown-menu";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { ChevronsUpDown } from "lucide-react";
import { api, type Schemas, unwrap } from "@/lib/api";

/** One of your salons (D-11): its pages, with a switcher to your others. */
export const Route = createFileRoute("/employer/$salonId")({
  beforeLoad: async ({ params }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}", {
      params: { path: { salonId: params.salonId } },
    });
    // Not (or no longer) on its team: back to your salons.
    if (result.response.status === 404) throw redirect({ to: "/employer" });
    return { salon: unwrap(result) };
  },
  component: SalonLayout,
});

const TABS = [
  { to: "/employer/$salonId", label: "Dashboard", exact: true },
  { to: "/employer/$salonId/jobs/new", label: "Post a job" },
  { to: "/employer/$salonId/team", label: "Team" },
  { to: "/employer/$salonId/billing", label: "Billing", owners: true },
  { to: "/employer/$salonId/settings", label: "Salon details", owners: true },
] as const;

function SalonLayout() {
  const { me, salon } = Route.useRouteContext();
  return (
    <>
      <nav aria-label="Your salon" className="mb-6 flex flex-wrap items-center gap-1 border-b pb-2">
        <SalonSwitcher current={salon} salons={me.salons} />
        {TABS.filter((tab) => !("owners" in tab) || salon.role === "owner").map((tab) => (
          <Button key={tab.to} asChild variant="ghost" size="sm">
            <Link
              to={tab.to}
              params={{ salonId: salon.id }}
              activeOptions={{ exact: "exact" in tab }}
              activeProps={{ className: "bg-muted" }}
            >
              {tab.label}
            </Link>
          </Button>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

function SalonSwitcher({
  current,
  salons,
}: {
  current: Schemas["MySalon"];
  salons: Schemas["OwnSalonSummary"][];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="mr-2">
          {current.name}
          <ChevronsUpDown aria-hidden />
          <span className="sr-only">Switch salon</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Your salons</DropdownMenuLabel>
        {salons.map((salon) => (
          <DropdownMenuItem key={salon.id} asChild disabled={salon.id === current.id}>
            <Link to="/employer/$salonId" params={{ salonId: salon.id }}>
              {salon.name}
              {salon.role === "manager" && (
                <span className="ml-auto text-muted-foreground text-xs">Manager</span>
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {salons.length > 1 && (
          <DropdownMenuItem asChild>
            <Link to="/employer">All salons</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/employer/onboarding">Add a salon</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/employer/account">Your account</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
