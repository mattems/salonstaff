import { Badge } from "@salonstaff/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ContactActions } from "@/components/contact-actions";
import { ProfileView, viewable } from "@/components/profile-view";
import { api, unwrap } from "@/lib/api";
import { applicationStatusLabel, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/$salonId/candidates/$id")({
  loader: async ({ params }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}/candidates/{userId}", {
      params: { path: { salonId: params.salonId, userId: params.id } },
    });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: ({ loaderData }) =>
    privatePage(
      loaderData ? `${loaderData.profile.firstName} ${loaderData.profile.lastName}` : "Candidate",
    ),
  component: Candidate,
});

function Candidate() {
  const candidate = Route.useLoaderData();
  const { salonId } = Route.useParams();
  return (
    <ProfileView
      full={viewable(candidate)}
      actions={
        <ContactActions
          salonId={salonId}
          candidateId={candidate.id}
          firstName={candidate.profile.firstName}
          contact={candidate.contact}
        />
      }
      aside={
        candidate.applications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Applied to your salon</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {candidate.applications.map((application) => (
                  <li key={application.id} className="flex justify-between gap-3">
                    <span>
                      <Link
                        to="/employer/$salonId/jobs/$id"
                        params={{ salonId, id: application.jobId }}
                        className="font-medium hover:underline"
                      >
                        {application.jobTitle}
                      </Link>
                      <span className="block text-muted-foreground text-xs">
                        {formatDate(application.createdAt)}
                      </span>
                    </span>
                    <Badge variant="secondary">{applicationStatusLabel(application.status)}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      }
    />
  );
}
