/**
 * A list of conversations (D-19): the job seeker's Inbox, and a salon's Messages. Each row is a link
 * the page draws, as the two live at different addresses.
 */
import { Card } from "@salonstaff/ui/components/card";
import { cn } from "@salonstaff/ui/lib/utils";
import type { ReactNode } from "react";
import type { Schemas } from "@/lib/api";
import { ago } from "@/lib/format";

export interface ConversationRow {
  key: string;
  title: string;
  /** A line under the title, e.g. which salon, when they're from several. */
  subtitle?: string | undefined;
  lastMessage: Schemas["Message"] | null;
  lastMessageAt: string;
  unread: number;
  /** Draws the row's link around its content. */
  link: (props: { className: string; children: ReactNode }) => ReactNode;
}

/** What the last message said, from the reader's side. */
function preview(message: Schemas["Message"] | null, me: "salon" | "seeker") {
  if (!message) return "";
  if (message.kind === "number_viewed") {
    return me === "seeker" ? "Looked at your number" : "Looked at their number";
  }
  return `${message.from === me ? "You: " : ""}${message.body}`;
}

export function ConversationList({
  rows,
  selected,
  me,
  className,
}: {
  rows: ConversationRow[];
  selected: string | undefined;
  me: "salon" | "seeker";
  className?: string;
}) {
  return (
    <Card className={cn("h-fit py-0", className)}>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.key}>
            {row.link({
              className: cn(
                "flex gap-3 px-4 py-3 text-sm hover:bg-muted",
                row.key === selected && "bg-muted",
              ),
              children: (
                <>
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      row.unread > 0 ? "bg-primary" : "bg-transparent",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate", row.unread > 0 && "font-semibold")}>
                        {row.title}
                      </span>
                      <span className="shrink-0 text-muted-foreground text-xs">
                        {ago(row.lastMessageAt)}
                      </span>
                    </span>
                    {row.subtitle && (
                      <span className="block truncate text-muted-foreground text-xs">
                        {row.subtitle}
                      </span>
                    )}
                    <span className="block truncate text-muted-foreground">
                      {preview(row.lastMessage, me)}
                    </span>
                    {row.unread > 0 && <span className="sr-only">Unread</span>}
                  </span>
                </>
              ),
            })}
          </li>
        ))}
      </ul>
    </Card>
  );
}
