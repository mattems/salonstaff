import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLink } from "@/components/app-link";
import { EmptyState } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { applicationStatusLabel, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/_seeker/applications/")({
  loader: async () => unwrap(await api.GET("/v1/me/applications")),
  head: () => privatePage("Your applications"),
  component: Applications,
});

function Applications() {
  const { items } = Route.useLoaderData();
  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="When you apply for a job it shows up here."
          action={
            <Button asChild>
              <Link to="/jobs" search={{}}>
                Find jobs
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {items.map((application) => (
            <Card key={application.id} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <AppLink href={application.job.path} className="hover:underline">
                    {application.job.title}
                  </AppLink>
                  <Badge variant={application.status === "declined" ? "outline" : "secondary"}>
                    {applicationStatusLabel(application.status)}
                  </Badge>
                  {application.job.closed && <Badge variant="outline">Job closed</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {application.job.salon.name} · {application.job.suburb} {application.job.state}
                </p>
                <p className="text-muted-foreground">Applied {formatDate(application.createdAt)}</p>
                {application.coverNote && (
                  <p className="whitespace-pre-line text-muted-foreground">
                    {application.coverNote}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
