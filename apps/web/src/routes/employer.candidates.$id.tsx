import { Badge } from "@salonstaff/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { requireOwnSalon } from "@/components/employer";
import { ProfileView } from "@/components/profile-view";
import { api, unwrap } from "@/lib/api";
import { applicationStatusLabel, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/candidates/$id")({
  beforeLoad: ({ context }) => {
    requireOwnSalon(context.me);
  },
  loader: async ({ params }) => {
    const result = await api.GET("/v1/salon/candidates/{userId}", {
      params: { path: { userId: params.id } },
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
  return (
    <ProfileView
      full={candidate}
      contact={candidate.contact}
      aside={
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
                      to="/employer/jobs/$id"
                      params={{ id: application.jobId }}
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
      }
    />
  );
}
