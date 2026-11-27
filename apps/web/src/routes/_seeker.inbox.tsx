import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRefresh } from "@/components/account-profile";
import { AppLink } from "@/components/app-link";
import { Conversation } from "@/components/conversation";
import { ConversationList } from "@/components/conversation-list";
import { EmptyState, PageHeader } from "@/components/page";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { applicationStatusLabel } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/**
 * The job seeker's conversations with salons (D-19): about their applications, and from salons
 * that found their profile. A list on the left, the chosen one on the right; opening one reads it.
 */
export const Route = createFileRoute("/_seeker/inbox")({
  validateSearch: (search: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof search.c === "string" ? search.c : undefined,
  }),
  loaderDeps: ({ search }) => ({ c: search.c }),
  loader: async ({ deps }) => {
    const [list, thread] = await Promise.all([
      api.GET("/v1/me/conversations"),
      deps.c
        ? api.GET("/v1/me/conversations/{id}", { params: { path: { id: deps.c } } })
        : Promise.resolve(null),
    ]);
    return {
      items: unwrap(list).items,
      thread: thread && thread.response.status !== 404 ? unwrap(thread) : null,
    };
  },
  head: () => privatePage("Inbox"),
  component: Inbox,
});

function Inbox() {
  const { items, thread } = Route.useLoaderData();
  const { c } = Route.useSearch();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Your conversations with salons: about your applications, and from salons that found your profile."
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          description="When a salon messages you or looks at your number, it shows here."
          action={
            <Button asChild variant="outline">
              <Link to="/account/sharing">Check who can see your profile</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ConversationList
            me="seeker"
            selected={c}
            className={thread ? "hidden lg:block" : undefined}
            rows={items.map((item) => ({
              key: item.id,
              title: item.salon.name,
              lastMessage: item.lastMessage,
              lastMessageAt: item.lastMessageAt,
              unread: item.unreadMessages,
              link: (props) => <Link to="/inbox" search={{ c: item.id }} {...props} />,
            }))}
          />
          {thread ? (
            <Thread key={thread.id} thread={thread} />
          ) : (
            <Card className="hidden lg:flex">
              <CardContent className="m-auto py-16 text-muted-foreground text-sm">
                Choose a conversation to read it.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Thread({ thread }: { thread: Schemas["MyConversationThread"] }) {
  const { me } = Route.useRouteContext();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const { salon } = thread;

  // Opening it read the salon's messages: bring the count in the header down, once.
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (refreshed.current === thread.id || !me?.unreadMessages) return;
    refreshed.current = thread.id;
    void refresh();
  }, [thread.id, me?.unreadMessages, refresh]);

  async function hide() {
    setPending(true);
    try {
      unwrap(
        await api.PUT("/v1/me/hidden-salons/{salonId}", {
          params: { path: { salonId: salon.id } },
        }),
      );
      await refresh(`Hidden from ${salon.name}. They can't see or contact you now.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 lg:hidden"
            onClick={() => navigate({ to: "/inbox", search: {} })}
          >
            <ArrowLeft aria-hidden />
            Inbox
          </Button>
          <AppLink href={salon.path} className="block font-semibold text-lg hover:underline">
            {salon.name}
          </AppLink>
          {thread.applications.length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {thread.applications.map((application) => (
                <Link
                  key={application.id}
                  to="/applications/$id"
                  params={{ id: application.id }}
                  className="flex items-center gap-1.5 hover:underline"
                >
                  {application.jobTitle}
                  <Badge variant="secondary">{applicationStatusLabel(application.status)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
        {thread.hidden ? (
          <span className="text-muted-foreground text-sm">
            You've hidden your profile from them.
          </span>
        ) : (
          <Button variant="outline" size="sm" disabled={pending} onClick={hide}>
            Hide from {salon.name}
          </Button>
        )}
      </div>
      <Conversation
        messages={thread.messages}
        me="seeker"
        livePath={`/api/v1/me/conversations/${thread.id}/live`}
        canSend={thread.canSend}
        sendHint={thread.sendHint}
        placeholder={`Reply to ${salon.name}…`}
        emptyMessage="No messages yet."
        send={async (body) => {
          unwrap(
            await api.POST("/v1/me/conversations/{id}/messages", {
              params: { path: { id: thread.id } },
              body: { body },
            }),
          );
        }}
      />
    </div>
  );
}
