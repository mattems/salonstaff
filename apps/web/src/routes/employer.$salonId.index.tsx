import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLink } from "@/components/app-link";
import { AbnBadge, EntitlementSummary, SalonStatusBanner } from "@/components/employer";
import { EmptyState, PageHeader } from "@/components/page";
import { JobsTable } from "@/components/salon-jobs";
import { api, unwrap } from "@/lib/api";
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
              <Link to="/employer/jobs/new" search={{ salon: salonId }}>
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
                <Link to="/employer/jobs/new" search={{ salon: salonId }}>
                  Post a job
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>This salon's jobs</CardTitle>
            <CardDescription>
              <Link to="/employer/applicants" search={{ salon: salonId }} className="underline">
                See its applicants
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobsTable jobs={jobs} showSalon={false} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
