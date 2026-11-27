import { fillQuickReply, QUICK_REPLIES } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppLink } from "@/components/app-link";
import { StatusSelect } from "@/components/applicants";
import { Conversation } from "@/components/conversation";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { formatDate, rightToWorkLabel } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/** One application, with the conversation between the salon's team and the applicant (D-17). */
export const Route = createFileRoute("/employer/$salonId/applications/$id")({
  loader: async ({ params }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}/applications/{id}", {
      params: { path: { salonId: params.salonId, id: params.id } },
    });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: ({ loaderData }) => {
    const person = loaderData?.applicant.candidate;
    return privatePage(person ? `${person.firstName} ${person.lastName}` : "Application");
  },
  component: ApplicationPage,
});

function ApplicationPage() {
  const thread = Route.useLoaderData();
  const { salonId, id } = Route.useParams();
  const { salon } = Route.useRouteContext();
  const { applicant } = thread;
  const person = applicant.candidate;
  const v = applicant.verification;
  const quickReplies = QUICK_REPLIES.map((reply) => ({
    label: reply.label,
    text: fillQuickReply(reply.text, {
      firstName: person?.firstName ?? "",
      job: applicant.job.title,
      salon: salon.name,
    }),
  }));
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
            <Button asChild variant="outline" size="sm">
              <Link
                to="/employer/$salonId/candidates/$id"
                params={{ salonId, id: applicant.candidateId }}
              >
                Full profile
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Conversation
          messages={thread.messages}
          me="salon"
          livePath={`/api/v1/employer/salons/${salonId}/applications/${id}/live`}
          canSend={thread.canSend}
          sendHint={thread.sendHint}
          quickReplies={quickReplies}
          placeholder={`Write to ${person?.firstName ?? "them"}…`}
          emptyMessage={`No messages yet. ${person?.firstName ?? "They"} can reply once you write.`}
          send={async (body) => {
            unwrap(
              await api.POST("/v1/employer/salons/{salonId}/applications/{id}/messages", {
                params: { path: { salonId, id } },
                body: { body },
              }),
            );
          }}
        />
        <Card size="sm" className="h-fit">
          <CardHeader>
            <CardTitle>Application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusSelect
              salonId={salonId}
              applicationId={applicant.id}
              status={applicant.status}
            />
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
              {v.rightToWork === "verified" && (
                <Badge variant="secondary">Work rights checked</Badge>
              )}
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
    </div>
  );
}
