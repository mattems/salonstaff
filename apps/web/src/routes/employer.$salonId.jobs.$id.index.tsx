import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppLink } from "@/components/app-link";
import {
  ApplicantsBrowser,
  loadApplicants,
  validateApplicantSearch,
} from "@/components/applicants";
import { Notice, PageHeader, Section } from "@/components/page";
import { ApiProblem, api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { employmentLabel, formatDate, roleLabel } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/$salonId/jobs/$id/")({
  validateSearch: validateApplicantSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}/jobs/{id}", {
      params: { path: { salonId: params.salonId, id: params.id } },
    });
    if (result.response.status === 404) throw notFound();
    const job = unwrap(result);
    return {
      job,
      applicants: await loadApplicants(deps, { salonId: params.salonId, jobId: job.id }),
    };
  },
  head: ({ loaderData }) => privatePage(loaderData?.job.title ?? "Job"),
  component: JobPage,
});

const STATUS = { draft: "Draft", published: "Live", expired: "Expired", closed: "Closed" } as const;

function JobPage() {
  const { job, applicants } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader
        title={job.title}
        description={
          <>
            <Badge variant={job.status === "published" ? "default" : "outline"}>
              {STATUS[job.status]}
            </Badge>{" "}
            {roleLabel(job.role)} · {employmentLabel(job.employmentType)} · {job.suburb} {job.state}
            {job.pay && ` · ${job.pay}`}
          </>
        }
        actions={<JobActions job={job} />}
      />
      {job.status === "published" && job.expiresAt && (
        <p className="text-muted-foreground text-sm">
          Live until {formatDate(job.expiresAt)}
          {job.paidVia && ` (${job.paidVia.replace(/_/g, " ")})`}.
        </p>
      )}
      <Section title={`Applicants (${applicants.total})`}>
        <ApplicantsBrowser
          data={applicants}
          search={search}
          onSearch={(next) => void navigate({ search: next, replace: true })}
          emptyMessage={
            job.status === "published"
              ? "We'll email you as soon as someone applies."
              : "Publish the job to start getting applicants."
          }
        />
      </Section>
    </div>
  );
}

function JobActions({ job }: { job: Schemas["SalonJob"] }) {
  const router = useRouter();
  const { salonId } = Route.useParams();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  async function act(kind: "publish" | "close") {
    setPending(true);
    setProblem(null);
    try {
      const options = { params: { path: { salonId, id: job.id } } };
      unwrap(
        kind === "publish"
          ? await api.POST("/v1/employer/salons/{salonId}/jobs/{id}/publish", options)
          : await api.POST("/v1/employer/salons/{salonId}/jobs/{id}/close", options),
      );
      toast.success(kind === "publish" ? "Your job is live" : "Job closed");
      await router.invalidate();
    } catch (error) {
      if (error instanceof ApiProblem) setProblem(error);
      else toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  const live = job.status === "published";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {live ? (
          <Button variant="outline" disabled={pending} onClick={() => act("close")}>
            Close job
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => act("publish")}>
            {job.status === "draft" ? "Publish" : "Relist"}
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/employer/$salonId/jobs/$id/edit" params={{ salonId, id: job.id }}>
            Edit
          </Link>
        </Button>
        {job.status !== "draft" && (
          <Button asChild variant="ghost">
            <AppLink href={job.path}>View ad</AppLink>
          </Button>
        )}
      </div>
      {problem && (
        <Notice tone="destructive">
          {problem.message}
          {problem.code === "listing_needed" && (
            <>
              {" "}
              <AppLink href={`/employer/${salonId}/billing`} className="underline">
                Go to billing
              </AppLink>
            </>
          )}
        </Notice>
      )}
    </div>
  );
}
