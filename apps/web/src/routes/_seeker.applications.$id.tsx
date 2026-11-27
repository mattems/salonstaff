import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { AppLink } from "@/components/app-link";
import { api, unwrap } from "@/lib/api";
import { applicationStatusLabel, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/** One of your applications. Messages with the salon are in your inbox (D-19). */
export const Route = createFileRoute("/_seeker/applications/$id")({
  loader: async ({ params }) => {
    const result = await api.GET("/v1/me/applications/{id}", {
      params: { path: { id: params.id } },
    });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: ({ loaderData }) => privatePage(loaderData?.job.title ?? "Your application"),
  component: ApplicationPage,
});

function ApplicationPage() {
  const application = Route.useLoaderData();
  const { job, conversationId, unreadMessages } = application;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <AppLink href={job.path} className="hover:underline">
            {job.title}
          </AppLink>
          <Badge variant={application.status === "declined" ? "outline" : "secondary"}>
            {applicationStatusLabel(application.status)}
          </Badge>
          {job.closed && <Badge variant="outline">Job closed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          {job.salon.name} · {job.suburb} {job.state}
        </p>
        <p className="text-muted-foreground">Applied {formatDate(application.createdAt)}</p>
        {application.coverNote && (
          <p className="whitespace-pre-line text-muted-foreground">{application.coverNote}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        {conversationId ? (
          <Button asChild>
            <Link to="/inbox" search={{ c: conversationId }}>
              <MessageSquare aria-hidden />
              Messages with {job.salon.name}
              {unreadMessages > 0 && <Badge variant="secondary">{unreadMessages} new</Badge>}
            </Link>
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            No messages yet. When {job.salon.name} writes to you, it's in your inbox.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
