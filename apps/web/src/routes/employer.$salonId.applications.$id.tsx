import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { StatusSelect } from "@/components/applicants";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { formatDate, rightToWorkLabel } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/** One application. The conversation with the applicant is on the Messages page (D-19). */
export const Route = createFileRoute("/employer/$salonId/applications/$id")({
  loader: async ({ params }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}/applications/{id}", {
      params: { path: { salonId: params.salonId, id: params.id } },
    });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: ({ loaderData }) => {
    const person = loaderData?.candidate;
    return privatePage(person ? `${person.firstName} ${person.lastName}` : "Application");
  },
  component: ApplicationPage,
});

function ApplicationPage() {
  const applicant = Route.useLoaderData();
  const { salonId } = Route.useParams();
  const person = applicant.candidate;
  const v = applicant.verification;
  return (
    <div className="space-y-6">
      <PageHeader
        title={person ? `${person.firstName} ${person.lastName}` : "Deleted account"}
        description={
          <>
            Applied for{" "}
            <AppLink href={applicant.job.path} className="underline">
              {applicant.job.title}
            </AppLink>{" "}
            on {formatDate(applicant.createdAt)}
          </>
        }
        actions={
          person && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link
                  to="/employer/$salonId/candidates/$id"
                  params={{ salonId, id: applicant.candidateId }}
                >
                  Full profile
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link
                  to="/employer/$salonId/messages"
                  params={{ salonId }}
                  search={{ with: applicant.candidateId }}
                >
                  <MessageSquare aria-hidden />
                  {applicant.lastMessageAt ? "Messages" : `Message ${person.firstName}`}
                  {applicant.unreadMessages > 0 && (
                    <Badge variant="secondary">{applicant.unreadMessages} new</Badge>
                  )}
                </Link>
              </Button>
            </>
          )
        }
      />
      <Card size="sm" className="max-w-2xl">
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <StatusSelect salonId={salonId} applicationId={applicant.id} status={applicant.status} />
          {person && (
            <p className="text-muted-foreground">
              {person.headline && (
                <>
                  {person.headline}
                  <br />
                </>
              )}
              {person.suburb} {person.state} · {person.yearsExperience ?? 0} yrs ·{" "}
              {rightToWorkLabel(person.rightToWork)}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {v.identity === "verified" && <Badge variant="secondary">ID verified</Badge>}
            {v.rightToWork === "verified" && <Badge variant="secondary">Work rights checked</Badge>}
            {v.qualification === "verified" && (
              <Badge variant="secondary">Qualification verified</Badge>
            )}
          </div>
          {applicant.coverNote && (
            <div>
              <p className="font-medium">Cover note</p>
              <p className="whitespace-pre-line text-muted-foreground">{applicant.coverNote}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
