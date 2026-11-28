import { fillQuickReply, QUICK_REPLIES } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRefresh } from "@/components/account-profile";
import { ContactActions } from "@/components/contact-actions";
import { Conversation } from "@/components/conversation";
import { ConversationList } from "@/components/conversation-list";
import { EmptyState, PageHeader } from "@/components/page";
import { api, type Schemas, unwrap } from "@/lib/api";
import { applicationStatusLabel } from "@/lib/format";
import { privatePage } from "@/lib/seo";

interface MessagesSearch {
  /** The salon the conversation is with (and, without `with`, only its conversations listed). */
  salon?: string | undefined;
  /** Their candidate ID: the conversation open on the right. */
  with?: string | undefined;
}

/**
 * Your salons' conversations (D-19, D-20): with applicants, and with people found by their
 * profile, at every salon you're on. A list on the left, the chosen one on the right (`?salon=`
 * and `?with=` their candidate ID, which may have no messages yet when the team starts one from a
 * profile).
 */
export const Route = createFileRoute("/employer/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    salon: typeof search.salon === "string" ? search.salon : undefined,
    with: typeof search.with === "string" ? search.with : undefined,
  }),
  loaderDeps: ({ search }) => ({ salon: search.salon, with: search.with }),
  loader: async ({ deps }) => {
    const path = { salonId: deps.salon ?? "" };
    const open = Boolean(deps.salon && deps.with);
    const [list, thread, candidate] = await Promise.all([
      api.GET("/v1/employer/conversations"),
      open && deps.with
        ? api.GET("/v1/employer/salons/{salonId}/candidates/{userId}/conversation", {
            params: { path: { ...path, userId: deps.with } },
          })
        : Promise.resolve(null),
      open && deps.with
        ? api.GET("/v1/employer/salons/{salonId}/candidates/{userId}", {
            params: { path: { ...path, userId: deps.with } },
          })
        : Promise.resolve(null),
    ]);
    const found = thread && thread.response.status !== 404 ? unwrap(thread) : null;
    return {
      items: unwrap(list).items,
      thread: found,
      contact: found && candidate?.response.ok ? unwrap(candidate).contact : null,
    };
  },
  head: () => privatePage("Messages"),
  component: Messages,
});

function Messages() {
  const { items, thread, contact } = Route.useLoaderData();
  const { salons } = Route.useRouteContext();
  const search = Route.useSearch();
  const several = salons.length > 1;
  const selected = search.salon && search.with ? `${search.salon}/${search.with}` : undefined;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description={
          several
            ? "Every salon's conversations with applicants, and with people found by their profile."
            : "Your conversations with applicants, and with people you found by their profile."
        }
      />
      {items.length === 0 && !thread ? (
        <EmptyState
          title="No conversations yet"
          description="Write to an applicant from their application, or to someone from their profile."
          action={
            <Button asChild variant="outline">
              <Link to="/employer/applicants">See your applicants</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ConversationList
            me="salon"
            selected={selected}
            className={thread ? "hidden lg:block" : undefined}
            rows={items.map((item) => ({
              key: `${item.salon.id}/${item.candidateId}`,
              title: item.name || "Deleted account",
              subtitle: several ? item.salon.name : undefined,
              lastMessage: item.lastMessage,
              lastMessageAt: item.lastMessageAt,
              unread: item.unreadMessages,
              link: (props) => (
                <Link
                  to="/employer/messages"
                  search={{ salon: item.salon.id, with: item.candidateId }}
                  {...props}
                />
              ),
            }))}
          />
          {thread ? (
            <Thread
              key={selected}
              salonId={search.salon as string}
              thread={thread}
              contact={contact}
            />
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

function Thread({
  salonId,
  thread,
  contact,
}: {
  salonId: string;
  thread: Schemas["CandidateConversation"];
  contact: Schemas["ContactOptions"] | null;
}) {
  const { salons } = Route.useRouteContext();
  const salon = salons.find((s) => s.id === salonId);
  const several = salons.length > 1;
  const navigate = useNavigate();
  const refresh = useRefresh();
  const firstName = thread.name.split(" ")[0] || "them";
  // Written from the latest application, if there is one.
  const latest = thread.applications[0];
  const quickReplies = latest
    ? QUICK_REPLIES.map((reply) => ({
        label: reply.label,
        text: fillQuickReply(reply.text, {
          firstName,
          job: latest.jobTitle,
          salon: salon?.name ?? "",
        }),
      }))
    : [];

  // Opening it read their messages: bring the count on the tab down, once.
  const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (refreshed.current === thread.candidateId || !salon?.unreadMessages) return;
    refreshed.current = thread.candidateId;
    void refresh();
  }, [thread.candidateId, salon?.unreadMessages, refresh]);

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 lg:hidden"
            onClick={() => navigate({ to: "/employer/messages", search: {} })}
          >
            <ArrowLeft aria-hidden />
            Messages
          </Button>
          <Link
            to="/employer/$salonId/candidates/$id"
            params={{ salonId, id: thread.candidateId }}
            className="block font-semibold text-lg hover:underline"
          >
            {thread.name || "Deleted account"}
          </Link>
          {several && salon && <p className="text-muted-foreground text-sm">With {salon.name}</p>}
          <div className="flex flex-wrap gap-2 text-sm">
            {thread.applications.length === 0 ? (
              <span className="text-muted-foreground">Hasn't applied to your salon</span>
            ) : (
              thread.applications.map((application) => (
                <Link
                  key={application.id}
                  to="/employer/$salonId/applications/$id"
                  params={{ salonId, id: application.id }}
                  className="flex items-center gap-1.5 hover:underline"
                >
                  {application.jobTitle}
                  <Badge variant="secondary">{applicationStatusLabel(application.status)}</Badge>
                </Link>
              ))
            )}
          </div>
        </div>
        {contact?.phone && (
          <ContactActions
            salonId={salonId}
            candidateId={thread.candidateId}
            firstName={firstName}
            contact={{ ...contact, message: false }}
          />
        )}
      </div>
      <Conversation
        messages={thread.messages}
        me="salon"
        livePath={`/api/v1/employer/salons/${salonId}/candidates/${thread.candidateId}/live`}
        canSend={thread.canSend}
        sendHint={thread.sendHint}
        quickReplies={quickReplies}
        placeholder={`Write to ${firstName}…`}
        emptyMessage={
          thread.applications.length
            ? `No messages yet. ${firstName} can reply once you write.`
            : `No messages yet. Introduce your salon: ${firstName} can reply once you write. Until they reply, you can write to them once a day.`
        }
        send={async (body) => {
          unwrap(
            await api.POST("/v1/employer/salons/{salonId}/candidates/{userId}/messages", {
              params: { path: { salonId, userId: thread.candidateId } },
              body: { body, ...(latest ? { applicationId: latest.id } : {}) },
            }),
          );
        }}
      />
    </div>
  );
}
