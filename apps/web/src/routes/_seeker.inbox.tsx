import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { cn } from "@salonstaff/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRefresh } from "@/components/account-profile";
import { AppLink } from "@/components/app-link";
import { EmptyState, PageHeader } from "@/components/page";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { ago, formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/**
 * Salons getting in touch (D-13): their messages, and each day one looked at your number. A list on
 * the left, the chosen one on the right; opening one marks it seen.
 */
export const Route = createFileRoute("/_seeker/inbox")({
  validateSearch: (search: Record<string, unknown>): { id?: string | undefined } => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  loader: async () => unwrap(await api.GET("/v1/me/profile/contacts")),
  head: () => privatePage("Inbox"),
  component: Inbox,
});

type Item = Schemas["ProfileContact"];

const summary = (item: Item) =>
  item.kind === "message" ? (item.message ?? "") : "Looked at your number";

function Inbox() {
  const { items } = Route.useLoaderData();
  const { id } = Route.useSearch();
  const refresh = useRefresh();
  const unread = items.filter((item) => !item.read).length;
  const selected = items.find((item) => item.id === id) ?? null;

  // Opening one marks it seen (and the count in the header goes down), once.
  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (!selected || selected.read || marked.current.has(selected.id)) return;
    marked.current.add(selected.id);
    api
      .POST("/v1/me/profile/contacts/read", { body: { ids: [selected.id] } })
      .then(unwrap)
      .then(() => refresh())
      .catch(() => {});
  }, [selected, refresh]);

  async function markAll() {
    try {
      unwrap(await api.POST("/v1/me/profile/contacts/read", { body: {} }));
      await refresh("All marked as read");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Salons that messaged you or looked at your number. Reply to a message by email."
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              Mark all as read
            </Button>
          )
        }
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
          <Card className={cn("py-0", selected && "hidden lg:block")}>
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to="/inbox"
                    search={{ id: item.id }}
                    className={cn(
                      "flex gap-3 px-4 py-3 text-sm hover:bg-muted",
                      item.id === selected?.id && "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.read ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn("truncate", !item.read && "font-semibold")}>
                          {item.salon.name}
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {ago(item.createdAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {item.kind === "message" ? (
                          <Mail className="size-3.5 shrink-0" aria-hidden />
                        ) : (
                          <Phone className="size-3.5 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{summary(item)}</span>
                      </span>
                      {!item.read && <span className="sr-only">Unread</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {selected ? (
            <Opened item={selected} />
          ) : (
            <Card className="hidden lg:flex">
              <CardContent className="m-auto py-16 text-muted-foreground text-sm">
                Choose a message to read it.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Opened({ item }: { item: Item }) {
  const refresh = useRefresh();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function hide() {
    setPending(true);
    try {
      unwrap(
        await api.PUT("/v1/me/hidden-salons/{salonId}", {
          params: { path: { salonId: item.salon.id } },
        }),
      );
      await refresh(`Hidden from ${item.salon.name}. They can't see or contact you now.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 lg:hidden"
          onClick={() => navigate({ to: "/inbox", search: {} })}
        >
          <ArrowLeft aria-hidden />
          Inbox
        </Button>
        <div className="space-y-1">
          <AppLink href={item.salon.path} className="font-semibold text-lg hover:underline">
            {item.salon.name}
          </AppLink>
          <p className="text-muted-foreground text-sm">
            {item.kind === "message"
              ? `${item.sender?.name || "Someone"} sent you a message · ${formatDate(item.createdAt)}`
              : `Looked at your number · ${formatDate(item.createdAt)}`}
          </p>
        </div>
        {item.kind === "message" ? (
          <p className="whitespace-pre-line leading-relaxed">{item.message}</p>
        ) : (
          <p className="text-sm">
            They may call or text you. Want to know more about them first? Look at{" "}
            <AppLink href={item.salon.path} className="underline">
              their salon's page
            </AppLink>
            .
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {item.kind === "message" && item.sender && (
            <Button asChild>
              <a
                href={`mailto:${item.sender.email}?subject=${encodeURIComponent(`Re: your message on Salon Staff`)}`}
              >
                <Mail aria-hidden />
                Reply by email
              </a>
            </Button>
          )}
          {item.hidden ? (
            <span className="text-muted-foreground text-sm">
              You've hidden your profile from them.
            </span>
          ) : (
            <Button variant="outline" disabled={pending} onClick={hide}>
              Hide from {item.salon.name}
            </Button>
          )}
        </div>
        {item.kind === "message" && item.sender && (
          <p className="text-muted-foreground text-xs">
            We also emailed you this message: replying to that email reaches{" "}
            {item.sender.name || "them"} too.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
