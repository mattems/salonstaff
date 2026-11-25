import { APPLICATION_STATUSES } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppLink } from "@/components/app-link";
import { selectClass } from "@/components/form";
import { EmptyState, Notice, PageHeader, Section } from "@/components/page";
import { ApiProblem, api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { employmentLabel, formatDate, rightToWorkLabel, roleLabel } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/$salonId/jobs/$id/")({
  loader: async ({ params }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}/jobs/{id}/applicants", {
      params: { path: { salonId: params.salonId, id: params.id } },
    });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: ({ loaderData }) => privatePage(loaderData?.job.title ?? "Job"),
  component: JobPage,
});

const STATUS = { draft: "Draft", published: "Live", expired: "Expired", closed: "Closed" } as const;

function JobPage() {
  const { job, items } = Route.useLoaderData();
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
      <Section title={`Applicants (${items.length})`}>
        {items.length === 0 ? (
          <EmptyState
            title="No applicants yet"
            description={
              job.status === "published"
                ? "We'll email you as soon as someone applies."
                : "Publish the job to start getting applicants."
            }
          />
        ) : (
          <div className="grid gap-3">
            {items.map((applicant) => (
              <ApplicantCard key={applicant.id} applicant={applicant} />
            ))}
          </div>
        )}
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

function ApplicantCard({ applicant }: { applicant: Schemas["Applicant"] }) {
  const router = useRouter();
  const { salonId } = Route.useParams();
  const [status, setStatus] = useState(applicant.status);
  const [pending, setPending] = useState(false);
  const person = applicant.candidate;
  const v = applicant.verification;
  async function change(next: Schemas["Applicant"]["status"]) {
    const before = status;
    setStatus(next);
    setPending(true);
    try {
      unwrap(
        await api.PATCH("/v1/employer/salons/{salonId}/applications/{id}", {
          params: { path: { salonId, id: applicant.id } },
          body: { status: next },
        }),
      );
      toast.success("Status updated");
      void router.invalidate();
    } catch (error) {
      setStatus(before);
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {person ? (
            <Link
              to="/employer/$salonId/candidates/$id"
              params={{ salonId, id: applicant.candidateId }}
              className="hover:underline"
            >
              {person.firstName} {person.lastName}
            </Link>
          ) : (
            "Deleted account"
          )}
          {applicant.isNew && <Badge>New</Badge>}
          {v.identity === "verified" && <Badge variant="secondary">ID verified</Badge>}
          {v.rightToWork === "verified" && <Badge variant="secondary">Work rights checked</Badge>}
          {v.qualification === "verified" && (
            <Badge variant="secondary">Qualification verified</Badge>
          )}
        </CardTitle>
        {person && (
          <CardDescription>
            {person.headline && `${person.headline} · `}
            {person.suburb} {person.state} · {person.yearsExperience} yrs ·{" "}
            {rightToWorkLabel(person.rightToWork)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {applicant.coverNote && <p className="whitespace-pre-line">{applicant.coverNote}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <select
              className={`${selectClass} w-auto`}
              value={status}
              disabled={pending}
              onChange={(event) => change(event.target.value as typeof status)}
            >
              {APPLICATION_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-muted-foreground">Applied {formatDate(applicant.createdAt)}</span>
          {person && (
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link
                to="/employer/$salonId/candidates/$id"
                params={{ salonId, id: applicant.candidateId }}
              >
                Full profile
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
