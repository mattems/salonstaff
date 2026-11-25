import { CardTable } from "@salonstaff/ui/card-table";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FormError, PageHeader, Section, Stat } from "@/components/page";
import { errorMessage } from "@/lib/api";
import { formatMoney, formatRelative } from "@/lib/format";
import { overviewQuery } from "@/lib/queries";

const n = (value: number) => value.toLocaleString("en-AU");

export function OverviewPage() {
  const overview = useQuery(overviewQuery);
  const o = overview.data;
  return (
    <>
      <PageHeader
        title="Overview"
        description="How Salon Staff is doing, and what's waiting for you."
      />
      <FormError message={overview.isError ? errorMessage(overview.error) : null} />
      {o ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Checks to decide"
              value={n(o.queues.pending_checks)}
              detail={
                <Link to="/checks" className="underline underline-offset-4">
                  Open the queue
                </Link>
              }
            />
            <Stat
              label="ABNs to check"
              value={n(o.queues.pending_abn)}
              detail={
                <Link
                  to="/salons"
                  search={{ abn_status: "pending" }}
                  className="underline underline-offset-4"
                >
                  See the salons
                </Link>
              }
            />
            <Stat
              label="Claims to review"
              value={n(o.queues.pending_claims)}
              detail={
                <Link to="/claims" className="underline underline-offset-4">
                  See the claims
                </Link>
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Job seekers"
              value={n(o.seekers)}
              detail={`${n(o.id_verified_seekers)} ID checked`}
            />
            <Stat
              label="Employers"
              value={n(o.employers)}
              detail={`${n(o.signups_week)} sign-ups in 7 days`}
            />
            <Stat
              label="Salons"
              value={n(o.salons.total)}
              detail={`${n(o.salons.claimed)} claimed · ${n(o.salons.unclaimed)} unclaimed`}
            />
            <Stat label="Live jobs" value={n(o.live_jobs)} />
            <Stat
              label="Applications"
              value={n(o.applications.all)}
              detail={`${n(o.applications.week)} in 7 days`}
            />
            <Stat label="Active Salon Plans" value={n(o.active_plans)} />
            <Stat
              label="Revenue collected"
              value={formatMoney(o.revenue_cents)}
              detail="All time, paid"
            />
          </div>
          <Section
            title="Newest accounts"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/users">All people</Link>
              </Button>
            }
          >
            <CardTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {o.newest.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Link
                          to="/users/$userId"
                          params={{ userId: user.id }}
                          className="font-medium"
                        >
                          {user.name || user.email || "No name yet"}
                        </Link>
                        {user.email ? (
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {user.role === "employer" ? "Employer" : "Job seeker"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatRelative(user.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardTable>
          </Section>
        </>
      ) : null}
    </>
  );
}
