import type { StaffPermission } from "@salonstaff/shared";
import { BRAND } from "@salonstaff/shared";
import { Avatar, AvatarFallback } from "@salonstaff/ui/components/avatar";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@salonstaff/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@salonstaff/ui/components/sidebar";
import { Logomark } from "@salonstaff/ui/logomark";
import { useNoSidebarShortcut } from "@salonstaff/ui/sidebar-shortcut";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useMatches } from "@tanstack/react-router";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronsUpDown,
  CreditCard,
  ExternalLink,
  FileCheck,
  FileUp,
  Hand,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  UserCog,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { ApiProblem } from "@/lib/api";
import { initials } from "@/lib/format";
import { chooseLocalStaff, chosenLocalStaff } from "@/lib/local-staff";
import {
  can,
  localStaffQuery,
  meQuery,
  type Queues,
  queryClient,
  queuesQuery,
  type StaffMe,
} from "@/lib/queries";

const APP_URL = import.meta.env.VITE_APP_URL;

interface NavItem {
  label: string;
  icon: LucideIcon;
  to:
    | "/"
    | "/checks"
    | "/claims"
    | "/users"
    | "/salons"
    | "/jobs"
    | "/payments"
    | "/directory"
    | "/audit-log"
    | "/staff";
  /** Opens the screen filtered, e.g. salons whose ABN waits for a check. */
  abnPending?: boolean;
  /** Hidden from staff without it. */
  needs?: StaffPermission;
  /** A count of waiting items beside it. */
  count?: keyof Queues;
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "To do",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      {
        to: "/checks",
        label: "Checks",
        icon: FileCheck,
        needs: "checks:review",
        count: "pending_checks",
      },
      {
        to: "/salons",
        label: "ABN checks",
        icon: BadgeCheck,
        abnPending: true,
        count: "pending_abn",
      },
      {
        to: "/claims",
        label: "Claims",
        icon: Hand,
        needs: "claims:review",
        count: "pending_claims",
      },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/users", label: "People", icon: Users },
      { to: "/salons", label: "Salons", icon: Building2 },
      { to: "/jobs", label: "Jobs", icon: Briefcase },
      { to: "/payments", label: "Payments", icon: CreditCard },
      { to: "/directory", label: "Directory import", icon: FileUp, needs: "directory:import" },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/audit-log", label: "Audit log", icon: ScrollText },
      { to: "/staff", label: "Staff", icon: UserCog, needs: "staff:manage" },
    ],
  },
];
const TITLES: Record<string, string> = {
  "": "Overview",
  checks: "Checks",
  claims: "Claims",
  users: "People",
  salons: "Salons",
  jobs: "Jobs",
  payments: "Payments",
  directory: "Directory import",
  "audit-log": "Audit log",
  staff: "Staff",
  passkeys: "Passkeys",
};

/** Locally: forget or set who you are, then ask the API again. */
async function becomeLocalStaff(email: string | null) {
  chooseLocalStaff(email);
  await queryClient.invalidateQueries();
}

function StaffMenu({ me }: { me: StaffMe }) {
  const { theme, setTheme } = useTheme();
  const name = me.staff.name || me.staff.email;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={`${name} · ${me.role}`}>
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">Staff · {me.role}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">Match system</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/passkeys">
                <KeyRound />
                Your passkeys
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={APP_URL} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open the website
              </a>
            </DropdownMenuItem>
            {chosenLocalStaff() ? (
              <DropdownMenuItem onSelect={() => becomeLocalStaff(null)}>
                <Users />
                Switch staff member (local)
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function GateFrame(props: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-sidebar px-4 py-10">
      <div className="flex w-full max-w-100 flex-col gap-4">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Logomark className="h-9 w-auto" />
          {BRAND.name}
          <Badge variant="secondary">Admin</Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{props.title}</h1>
        {props.children}
      </div>
    </main>
  );
}

/**
 * Shown instead of the portal when the staff gate turns someone away. On a
 * laptop there is no Cloudflare Access, so it offers the local staff to
 * choose from instead; deployed, that list doesn't exist and it says why.
 */
function Gate({ error }: { error: unknown }) {
  const problem = error instanceof ApiProblem ? error : null;
  const local = useQuery(localStaffQuery);
  if (local.isPending) return null;

  if (local.isSuccess) {
    return (
      <GateFrame title="Who are you?">
        <p className="text-sm text-muted-foreground">
          This is local development, so there is no Cloudflare Access to say. Choose a staff member
          to use the portal as.
        </p>
        {local.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody is staff yet. Add yourself with{" "}
            <code className="font-mono text-sm">
              bun db:staff -- --email you@example.com --name "Your Name" --role owner
            </code>
            , then reload.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {local.data.map((member) => (
              <Button
                key={member.email}
                variant="outline"
                className="h-auto justify-between py-2"
                onClick={() => becomeLocalStaff(member.email)}
              >
                <span className="grid text-left leading-tight">
                  <span className="font-medium">{member.name}</span>
                  <span className="text-xs text-muted-foreground">{member.email}</span>
                </span>
                <Badge variant="secondary">{member.role}</Badge>
              </Button>
            ))}
          </div>
        )}
      </GateFrame>
    );
  }

  return (
    <GateFrame title="You can't open the admin portal">
      <p className="text-sm text-muted-foreground">
        {problem ? `${problem.message}.` : "We couldn't reach the server."}
      </p>
      {problem?.hint ? <p className="text-sm text-muted-foreground">{problem.hint}</p> : null}
      <div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </GateFrame>
  );
}

/** The portal's frame: collapsible sidebar, top bar, and the current page. */
export function Shell() {
  useNoSidebarShortcut();
  const me = useQuery({ ...meQuery, retry: false });
  const matches = useMatches();
  const last = matches.at(-1);
  const pathname = last?.pathname ?? "/";
  const section = pathname.split("/")[1] ?? "";
  const abnFilter = (last?.search as { abn_status?: string } | undefined)?.abn_status === "pending";
  const queues = useQuery({ ...queuesQuery, enabled: Boolean(me.data) });

  if (me.isError) return <Gate error={me.error} />;
  if (!me.data) return null;
  const staff = me.data;
  const isActive = (item: NavItem) =>
    `/${section}` === item.to && (item.to !== "/salons" || Boolean(item.abnPending) === abnFilter);
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={`${BRAND.name} admin`}>
                <Link to="/">
                  {/* `!`: the menu button sizes every svg inside it to 16px. Smaller when the
                      sidebar is only icons, to fit its 32px. */}
                  <Logomark className="h-6! w-auto! group-data-[collapsible=icon]:h-5!" />
                  <span className="truncate font-semibold">{BRAND.name}</span>
                  <Badge variant="secondary" className="ml-auto">
                    Admin
                  </Badge>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {NAV.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items
                  .filter((item) => !item.needs || can(staff, item.needs))
                  .map((item) => {
                    const count = item.count ? (queues.data?.[item.count] ?? 0) : 0;
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton asChild tooltip={item.label} isActive={isActive(item)}>
                          {item.abnPending ? (
                            <Link to="/salons" search={{ abn_status: "pending" }}>
                              <item.icon />
                              <span>{item.label}</span>
                            </Link>
                          ) : (
                            <Link to={item.to}>
                              <item.icon />
                              <span>{item.label}</span>
                            </Link>
                          )}
                        </SidebarMenuButton>
                        {count > 0 ? <SidebarMenuBadge>{count}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <StaffMenu me={staff} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex h-13 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <h1 className="mr-auto truncate font-semibold">{TITLES[section] ?? "Admin"}</h1>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
