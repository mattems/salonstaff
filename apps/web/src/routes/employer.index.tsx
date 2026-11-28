import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { EntitlementSummary } from "@/components/employer";
import { EmptyState, Notice, PageHeader } from "@/components/page";
import { JobsTable } from "@/components/salon-jobs";
import { api, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/**
 * Hiring across all your salons (D-20): what's live, who's new, who's waiting for a reply, and
 * each salon. With no salon yet you start by adding one.
 */
export const Route = createFileRoute("/employer/")({
  beforeLoad: ({ context }) => {
    if (context.salons.length === 0) throw redirect({ to: "/employer/onboarding" });
  },
  loader: async () => {
    const [jobs, conversations, salons] = await Promise.all([
      api.GET("/v1/employer/jobs"),
      api.GET("/v1/employer/conversations"),
      // The full details (launch terms, listings) of each salon.
      api.GET("/v1/employer/salons"),
    ]);
    return {
      jobs: unwrap(jobs).items,
      conversations: unwrap(conversations).items,
      salons: unwrap(salons).items,
    };
  },
  head: () => privatePage("Overview"),
  component: Overview,
});

function Overview() {
  const { jobs, conversations, salons } = Route.useLoaderData();
  const several = salons.length > 1;
  const live = jobs.filter((job) => job.status === "published");
  const newApplicants = jobs.reduce((sum, job) => sum + job.newApplicants, 0);
  const waiting = conversations.filter((c) => c.unreadMessages > 0);
  const stuck = salons.filter((salon) => salon.status !== "active" || !salon.entitlement.ok);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={several ? `Hiring across your ${salons.length} salons.` : salons[0]?.name}
        actions={
          <Button asChild>
            <Link to="/employer/jobs/new">Post a job</Link>
          </Button>
        }
      />

      {stuck.map((salon) => (
        <Notice
          key={salon.id}
          tone={salon.status === "active" ? "default" : "destructive"}
          title={
            salon.status === "active"
              ? `${salon.name} can't publish jobs`
              : `${salon.name} is ${salon.status}`
          }
        >
          {salon.status === "active" ? (
            <>
              <EntitlementSummary
                salonId={salon.id}
                entitlement={salon.entitlement}
                freeUntil={salon.freeUntil}
                listingCredits={salon.listingCredits}
              />{" "}
              {salon.role === "owner" && (
                <Link
                  to="/employer/$salonId/billing"
                  params={{ salonId: salon.id }}
                  className="font-medium underline"
                >
                  Billing
                </Link>
              )}
            </>
          ) : (
            (salon.statusReason ?? "Its jobs aren't shown. Contact support@salonstaff.com.au.")
          )}
        </Notice>
      ))}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live jobs" value={live.length} to="/employer/jobs" />
        <Stat
          label="New applicants"
          value={newApplicants}
          to="/employer/applicants"
          search={{ status: "submitted" }}
        />
        <Stat label="Waiting for a reply" value={waiting.length} to="/employer/messages" />
        <Stat
          label={several ? "Salons" : "Drafts"}
          value={several ? salons.length : jobs.filter((j) => j.status === "draft").length}
          to={several ? undefined : "/employer/jobs"}
        />
      </div>

      {waiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for a reply</CardTitle>
            <CardDescription>People who've written to you.</CardDescription>
            <CardAction>
              <Button asChild size="sm" variant="outline">
                <Link to="/employer/messages">All messages</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-6 divide-y sm:grid-cols-2 sm:divide-y-0">
              {waiting.slice(0, 6).map((c) => (
                <li key={`${c.salon.id}-${c.candidateId}`}>
                  <Link
                    to="/employer/messages"
                    search={{ salon: c.salon.id, with: c.candidateId }}
                    className="flex items-center gap-2 py-2 text-sm hover:underline"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {c.name || "Deleted account"}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {several && `${c.salon.name} · `}
                        {formatDate(c.lastMessageAt)}
                      </span>
                    </span>
                    <Badge>{c.unreadMessages}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live jobs</CardTitle>
          <CardDescription>
            {live.length === 0 ? "Nothing live right now." : "Ads people can apply for now."}
          </CardDescription>
          <CardAction>
            <Button asChild size="sm" variant="outline">
              <Link to="/employer/jobs">All jobs</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {live.length === 0 ? (
            <EmptyState
              title="No live jobs"
              description="Post a job: it goes live straight away."
              action={
                <Button asChild>
                  <Link to="/employer/jobs/new">Post a job</Link>
                </Button>
              }
            />
          ) : (
            <JobsTable jobs={live} showSalon={several} />
          )}
        </CardContent>
      </Card>

      {several && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Your salons</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {salons.map((salon) => {
              const theirs = jobs.filter((job) => job.salon.id === salon.id);
              return (
                <Card key={salon.id} size="sm">
                  <CardHeader>
                    <CardTitle>
                      <Link
                        to="/employer/$salonId"
                        params={{ salonId: salon.id }}
                        className="hover:underline"
                      >
                        {salon.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {salon.suburb} {salon.state} · {salon.role === "owner" ? "Owner" : "Manager"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-muted-foreground text-sm">
                    {theirs.filter((j) => j.status === "published").length} live ·{" "}
                    {theirs.reduce((sum, j) => sum + j.newApplicants, 0)} new applicants
                    {salon.unreadMessages > 0 && ` · ${salon.unreadMessages} unread`}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  to,
  search,
}: {
  label: string;
  value: number;
  to?: "/employer/jobs" | "/employer/applicants" | "/employer/messages" | undefined;
  search?: { status: "submitted" };
}) {
  const body = (
    <Card size="sm" className={to ? "transition-colors hover:bg-muted/50" : undefined}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
  return to ? (
    <Link to={to} search={search}>
      {body}
    </Link>
  ) : (
    body
  );
}
