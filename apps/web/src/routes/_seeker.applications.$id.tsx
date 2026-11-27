import { Badge } from "@salonstaff/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useRefresh } from "@/components/account-profile";
import { AppLink } from "@/components/app-link";
import { Conversation } from "@/components/conversation";
import { api, unwrap } from "@/lib/api";
import { applicationStatusLabel, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/** One of your applications, and your conversation with the salon about it (D-17). */
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
  const thread = Route.useLoaderData();
  const { id } = Route.useParams();
  const { me } = Route.useRouteContext();
  const refresh = useRefresh();
  const { job } = thread;

  // Opening it read the salon's messages: bring the inbox count in the header up to date, once.
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (refreshed.current === id || !me?.unreadMessages) return;
    refreshed.current = id;
    void refresh();
  }, [id, me?.unreadMessages, refresh]);

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <AppLink href={job.path} className="hover:underline">
              {job.title}
            </AppLink>
            <Badge variant={thread.status === "declined" ? "outline" : "secondary"}>
              {applicationStatusLabel(thread.status)}
            </Badge>
            {job.closed && <Badge variant="outline">Job closed</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            {job.salon.name} · {job.suburb} {job.state}
          </p>
          <p className="text-muted-foreground">Applied {formatDate(thread.createdAt)}</p>
          {thread.coverNote && (
            <p className="whitespace-pre-line text-muted-foreground">{thread.coverNote}</p>
          )}
        </CardContent>
      </Card>
      <Conversation
        messages={thread.messages}
        me="seeker"
        livePath={`/api/v1/me/applications/${id}/live`}
        canSend={thread.canSend}
        sendHint={thread.sendHint}
        placeholder={`Reply to ${job.salon.name}…`}
        emptyMessage="No messages yet. When the salon writes about your application, you can reply here."
        send={async (body) => {
          unwrap(
            await api.POST("/v1/me/applications/{id}/messages", {
              params: { path: { id } },
              body: { body },
            }),
          );
        }}
      />
    </div>
  );
}
