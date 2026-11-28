/**
 * The salon management area's frame (D-20): a sidebar down the left with hiring across every salon
 * you're on (overview, jobs, applicants, messages), each salon's own pages, and your account; the
 * current page on the right. On a phone the sidebar is a sheet behind the menu button.
 */
import { BRAND } from "@salonstaff/shared";
import { Avatar, AvatarFallback } from "@salonstaff/ui/components/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@salonstaff/ui/components/breadcrumb";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@salonstaff/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@salonstaff/ui/components/dropdown-menu";
import { Separator } from "@salonstaff/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@salonstaff/ui/components/sidebar";
import { Logomark } from "@salonstaff/ui/logomark";
import { useNoSidebarShortcut } from "@salonstaff/ui/sidebar-shortcut";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Briefcase,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  MessageSquare,
  Plus,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect } from "react";
import { useSignOut } from "@/components/site-chrome";
import type { Schemas } from "@/lib/api";
import type { Me } from "@/lib/session";

export type SalonSummary = Schemas["MySalonWithInbox"];

type Section = "overview" | "jobs" | "applicants" | "messages" | "account" | "onboarding";

interface HiringItem {
  section: Section;
  to: "/employer" | "/employer/jobs" | "/employer/applicants" | "/employer/messages";
  label: string;
  icon: LucideIcon;
}

const HIRING: HiringItem[] = [
  { section: "overview", to: "/employer", label: "Overview", icon: LayoutDashboard },
  { section: "jobs", to: "/employer/jobs", label: "Jobs", icon: Briefcase },
  { section: "applicants", to: "/employer/applicants", label: "Applicants", icon: Users },
  { section: "messages", to: "/employer/messages", label: "Messages", icon: MessageSquare },
];

const SECTION_LABEL: Record<Section, string> = {
  overview: "Overview",
  jobs: "Jobs",
  applicants: "Applicants",
  messages: "Messages",
  account: "Your account",
  onboarding: "Add a salon",
};

/** One salon's own pages, under its name in the sidebar. */
const SALON_PAGES = [
  { page: "", to: "/employer/$salonId", label: "Overview" },
  { page: "team", to: "/employer/$salonId/team", label: "Team" },
  { page: "billing", to: "/employer/$salonId/billing", label: "Billing", owners: true },
  { page: "settings", to: "/employer/$salonId/settings", label: "Salon details", owners: true },
] as const;

/** Where the address is: a page across all salons, or one of a salon's own. */
function placeOf(pathname: string): { section: Section | null; salonId?: string; page?: string } {
  const [, , first, ...rest] = pathname.split("/");
  if (!first) return { section: "overview" };
  if (first in SECTION_LABEL) return { section: first as Section, page: rest[0] ?? "" };
  // `/employer/{salonId}/…`: a job, an application or a profile belong with the lists they're
  // opened from; the rest are the salon's own pages.
  const [page = "", next] = rest;
  if (page === "jobs") return { section: "jobs", salonId: first, page: next ?? "" };
  if (page === "applications" || page === "candidates") {
    return { section: "applicants", salonId: first, page };
  }
  return { section: null, salonId: first, page };
}

export function SalonShell({
  me,
  salons,
  children,
}: {
  me: Me;
  salons: SalonSummary[];
  children: ReactNode;
}) {
  useNoSidebarShortcut();
  const { pathname } = useLocation();
  const place = placeOf(pathname);
  const current = salons.find((s) => s.id === place.salonId);
  const unread = salons.reduce((sum, s) => sum + s.unreadMessages, 0);
  const canPost = salons.some((s) => s.status === "active");

  return (
    <SidebarProvider>
      <CloseSheetOnNavigate />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip={BRAND.name}>
                <Link to="/employer">
                  <Logomark className="h-6! w-auto! group-data-[collapsible=icon]:h-5!" />
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">{BRAND.name}</span>
                    <span className="truncate text-muted-foreground text-xs">Salon management</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {canPost && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Post a job"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <Link to="/employer/jobs/new" search={{ salon: current?.id }}>
                    <Plus />
                    <span>Post a job</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Hiring</SidebarGroupLabel>
            <SidebarMenu>
              {HIRING.map((item) => (
                <SidebarMenuItem key={item.section}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.label}
                    isActive={place.section === item.section}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.section === "messages" && unread > 0 && (
                    <SidebarMenuBadge aria-label={`${unread} with unread messages`}>
                      {unread}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>
              {salons.length === 1 ? "Your salon" : "Your salons"}
            </SidebarGroupLabel>
            <SidebarGroupAction asChild title="Add a salon">
              <Link to="/employer/onboarding">
                <Plus />
                <span className="sr-only">Add a salon</span>
              </Link>
            </SidebarGroupAction>
            <SidebarMenu>
              {salons.map((salon) => (
                <SalonItem
                  key={salon.id}
                  salon={salon}
                  open={salon.id === place.salonId || salons.length === 1}
                  activePage={
                    salon.id === place.salonId && place.section === null ? place.page : undefined
                  }
                />
              ))}
              {salons.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={place.section === "onboarding"}>
                    <Link to="/employer/onboarding">
                      <Plus />
                      <span>Add your salon</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <AccountMenu me={me} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Crumbs place={place} salon={current} />
        </header>
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** A salon in the sidebar: its name, opening onto its own pages. */
function SalonItem({
  salon,
  open,
  activePage,
}: {
  salon: SalonSummary;
  open: boolean;
  activePage: string | undefined;
}) {
  const { state, setOpen, isMobile } = useSidebar();
  return (
    <Collapsible asChild defaultOpen={open} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={salon.name}
            isActive={activePage !== undefined && state === "collapsed" && !isMobile}
            // Collapsed to icons there's no room for its pages: open the sidebar to show them.
            onClick={() => state === "collapsed" && !isMobile && setOpen(true)}
          >
            <Store />
            <span className="truncate">{salon.name}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {SALON_PAGES.filter((p) => !("owners" in p) || salon.role === "owner").map((p) => (
              <SidebarMenuSubItem key={p.page}>
                <SidebarMenuSubButton asChild isActive={activePage === p.page}>
                  <Link to={p.to} params={{ salonId: salon.id }}>
                    <span>{p.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            {salon.role === "manager" && (
              <li className="px-2 py-1 text-muted-foreground text-xs">You're a manager here</li>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

function AccountMenu({ me }: { me: Me }) {
  const signOut = useSignOut();
  const name = me.name || me.email || "Your account";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={name}>
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{name}</span>
                {me.email && me.email !== name && (
                  <span className="truncate text-muted-foreground text-xs">{me.email}</span>
                )}
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuLabel className="text-muted-foreground text-xs">{name}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/employer/account">
                <UserRound />
                Your account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/employer/onboarding">
                <Plus />
                Add a salon
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/">
                <ExternalLink />
                Go to the website
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const SALON_PAGE_LABEL: Record<string, string> = {
  team: "Team",
  billing: "Billing",
  settings: "Salon details",
  applications: "Application",
  candidates: "Profile",
};

type Crumb = { label: string; to?: HiringItem["to"]; salonId?: string };

/** Where you are: a page across all salons, a salon's own page, or a job, application or
 * profile opened from one of the lists (that list first). */
function trailOf(place: ReturnType<typeof placeOf>, salon: SalonSummary | undefined): Crumb[] {
  const section = place.section ?? "overview";
  if (!place.salonId) {
    return place.section === "jobs" && place.page === "new"
      ? [{ label: "Jobs", to: "/employer/jobs" }, { label: "Post a job" }]
      : [{ label: SECTION_LABEL[section] }];
  }
  const id = place.salonId;
  const name = salon?.name ?? "Salon";
  if (place.section) {
    const list = HIRING.find((h) => h.section === place.section);
    const page =
      place.section === "jobs"
        ? place.page === "new"
          ? "New job"
          : "Job"
        : (SALON_PAGE_LABEL[place.page ?? ""] ?? "");
    return [
      { label: SECTION_LABEL[place.section], ...(list ? { to: list.to } : {}) },
      { label: name, salonId: id },
      { label: page },
    ];
  }
  return place.page
    ? [{ label: name, salonId: id }, { label: SALON_PAGE_LABEL[place.page] ?? place.page }]
    : [{ label: name }];
}

function Crumbs({
  place,
  salon,
}: {
  place: ReturnType<typeof placeOf>;
  salon: SalonSummary | undefined;
}) {
  const trail = trailOf(place, salon);
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <Fragment key={`${crumb.salonId ?? crumb.to ?? ""}${crumb.label}`}>
              {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className={last ? "min-w-0" : "hidden md:inline-flex"}>
                {last ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : crumb.salonId ? (
                  <BreadcrumbLink asChild>
                    <Link to="/employer/$salonId" params={{ salonId: crumb.salonId }}>
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                ) : crumb.to ? (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** On a phone the sidebar is a sheet: closed again once you've picked a page from it. */
function CloseSheetOnNavigate() {
  const { setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new page, to close it.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  return null;
}
