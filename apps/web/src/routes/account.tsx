import { Button } from "@salonstaff/ui/components/button";
import { cn } from "@salonstaff/ui/lib/utils";
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Strength } from "@/components/account-profile";
import { Page } from "@/components/page";
import { api, orNull } from "@/lib/api";
import { requireSignedIn } from "@/lib/session";

/**
 * A job seeker's profile and account: the sections on the left, the one chosen on the right. Their
 * inbox and jobs are pages of their own (`/inbox`, `/applications`). Employer accounts have their
 * dashboard instead. The profile is loaded once here for every section.
 */
export const Route = createFileRoute("/account")({
  beforeLoad: ({ context, location }) => {
    const me = requireSignedIn(context.me, location.href);
    if (me.role === "employer") throw redirect({ to: "/employer" });
    return { me };
  },
  loader: async () => ({ profile: orNull(await api.GET("/v1/me/profile")) }),
  component: AccountLayout,
});

type To =
  | "/account"
  | "/account/photo"
  | "/account/skills"
  | "/account/availability"
  | "/account/portfolio"
  | "/account/experience"
  | "/account/endorsements"
  | "/account/sharing"
  | "/account/contact"
  | "/account/verify"
  | "/account/security";

const GROUPS: { label: string; items: { to: To; label: string; needsProfile?: true }[] }[] = [
  {
    label: "Your profile",
    items: [
      { to: "/account", label: "Basics" },
      { to: "/account/photo", label: "Photo", needsProfile: true },
      { to: "/account/skills", label: "Skills", needsProfile: true },
      { to: "/account/availability", label: "Availability and pay", needsProfile: true },
      { to: "/account/portfolio", label: "Portfolio", needsProfile: true },
      { to: "/account/experience", label: "Experience and qualifications", needsProfile: true },
      { to: "/account/endorsements", label: "Endorsements", needsProfile: true },
    ],
  },
  {
    label: "Who sees it",
    items: [
      { to: "/account/sharing", label: "Visibility and sharing", needsProfile: true },
      { to: "/account/contact", label: "How salons contact you", needsProfile: true },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/account/verify", label: "Verification" },
      { to: "/account/security", label: "Sign-in and security" },
    ],
  },
];

function AccountLayout() {
  const { profile } = Route.useLoaderData();
  return (
    <Page width="wide">
      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-6">
          {profile && (
            <div className="space-y-4">
              <Strength full={profile} />
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/account/preview">Preview as a salon</Link>
              </Button>
            </div>
          )}
          <nav aria-label="Your account" className="space-y-5">
            {GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {group.label}
                </p>
                <ul className="flex flex-wrap gap-1 lg:flex-col">
                  {group.items.map((item) => {
                    const disabled = item.needsProfile && !profile;
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          activeOptions={{ exact: true }}
                          activeProps={{ className: "bg-muted font-medium" }}
                          aria-disabled={disabled || undefined}
                          className={cn(
                            "block rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                            disabled && "text-muted-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </Page>
  );
}
