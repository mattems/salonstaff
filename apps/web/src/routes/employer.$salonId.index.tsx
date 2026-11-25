import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLink } from "@/components/app-link";
import { AbnBadge, EntitlementSummary, SalonStatusBanner } from "@/components/employer";
import { EmptyState, PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/$salonId/")({
  loader: async ({ context, params }) => {
    const jobs = await api.GET("/v1/employer/salons/{salonId}/jobs", {
      params: { path: { salonId: params.salonId } },
    });
    return { salon: context.salon, jobs: unwrap(jobs).items };
  },
  head: ({ loaderData }) => privatePage(loaderData?.salon.name ?? "Your salon"),
  component: Dashboard,
});

const JOB_STATUS = {
  draft: "Draft",
  published: "Live",
  expired: "Expired",
  closed: "Closed",
} as const;

function Dashboard() {
  const { salon, jobs } = Route.useLoaderData();
  const salonId = salon.id;
  const owner = salon.role === "owner";
  return (
    <div className="space-y-6">
      <PageHeader
        title={salon.name}
        description={
          <>
            {salon.suburb} {salon.state} ·{" "}
            <AppLink href={salon.path} className="underline">
              Your public page
            </AppLink>
          </>
        }
        actions={
          salon.status === "active" && (
            <Button asChild>
              <Link to="/employer/$salonId/jobs/new" params={{ salonId }}>
                Post a job
              </Link>
            </Button>
          )
        }
      />
      <SalonStatusBanner salon={salon} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Listings</CardTitle>
            <CardDescription>
              <EntitlementSummary
                salonId={salonId}
                entitlement={salon.entitlement}
                freeUntil={salon.freeUntil}
                listingCredits={salon.listingCredits}
              />
            </CardDescription>
          </CardHeader>
          {owner && (
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to="/employer/$salonId/billing" params={{ salonId }} search={{}}>
                  Billing
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Business</CardTitle>
            <CardDescription className="space-y-1">
              <AbnBadge salon={salon} />
              {salon.founding && <p>Founding salon: your Salon Plan price is locked in.</p>}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Applicants</CardTitle>
            <CardDescription>
              {jobs.reduce((sum, job) => sum + job.applicants, 0)} in total,{" "}
              {jobs.reduce((sum, job) => sum + job.newApplicants, 0)} new
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Post your first job: it goes live straight away."
          action={
            salon.status === "active" && (
              <Button asChild>
                <Link to="/employer/$salonId/jobs/new" params={{ salonId }}>
                  Post a job
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Live until</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link
                        to="/employer/$salonId/jobs/$id"
                        params={{ salonId, id: job.id }}
                        className="font-medium hover:underline"
                      >
                        {job.title}
                      </Link>
                      <span className="block text-muted-foreground text-xs">
                        {job.suburb} {job.state}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={job.status === "published" ? "default" : "outline"}>
                        {JOB_STATUS[job.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {job.applicants}
                      {job.newApplicants > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {job.newApplicants} new
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.status === "published" ? formatDate(job.expiresAt) : "–"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
