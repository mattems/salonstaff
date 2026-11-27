/**
 * The conversation between a salon's team and a job seeker (D-19), for either side. Live while
 * it's on screen (D-18): new messages and "typing…" arrive over a WebSocket.
 */
import {
  LIVE_TIMING,
  type LiveConnection,
  type LiveSocket,
  openLive,
  withMessage,
} from "@salonstaff/shared";
import { Bubble, BubbleContent } from "@salonstaff/ui/components/bubble";
import { Button } from "@salonstaff/ui/components/button";
import { Card } from "@salonstaff/ui/components/card";
import { Message, MessageContent, MessageHeader } from "@salonstaff/ui/components/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@salonstaff/ui/components/message-scroller";
import { Textarea } from "@salonstaff/ui/components/textarea";
import { useMatch, useRouter } from "@tanstack/react-router";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FormMessage, useAction } from "@/components/form";
import type { Schemas } from "@/lib/api";
import { ago } from "@/lib/format";

type ChatMessage = Schemas["Message"];

/** The socket for `path` on this site (`/api/...`): the website forwards it to the API. */
function socketFor(path: string): LiveSocket {
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url) as unknown as LiveSocket;
}

/**
 * Keeps the conversation live while the tab is showing. New messages are added straight away;
 * one from the other side also reloads the page's data, which marks it read.
 */
function useLive(path: string | undefined, me: ChatMessage["from"]) {
  const router = useRouter();
  const matchId = useMatch({ strict: false, select: (match) => match.id });
  const page = useRef(matchId);
  page.current = matchId;
  const [arrived, setArrived] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<string | null>(null);
  const live = useRef<LiveConnection | null>(null);

  useEffect(() => {
    if (!path) return;
    setArrived([]);
    let hideTyping: ReturnType<typeof setTimeout> | undefined;
    // The conversation first: reading it marks the other side's messages read, so the unread
    // counts in the header and tabs, reloaded next, already leave them out.
    const reread = async () => {
      await router.invalidate({ filter: (match) => match.id === page.current });
      await router.invalidate({ filter: (match) => match.id !== page.current });
    };
    const start = () => {
      live.current ??= openLive<ChatMessage>(() => socketFor(path), {
        onMessage(message) {
          setArrived((prev) => withMessage(prev, message));
          if (message.from !== me) {
            setTyping(null);
            void reread();
          }
        },
        onTyping(name, from) {
          if (from === me) return;
          setTyping(name);
          clearTimeout(hideTyping);
          hideTyping = setTimeout(() => setTyping(null), LIVE_TIMING.typingShownForMs);
        },
        onReconnect: () => void reread(),
      });
    };
    const stop = () => {
      live.current?.close();
      live.current = null;
    };
    // A hidden tab isn't watching: closing it lets the other side's messages notify as usual.
    const onVisibility = () => {
      if (document.hidden) return stop();
      start();
      void reread();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(hideTyping);
      stop();
    };
  }, [path, me, router]);

  return { arrived, typing, live };
}

export function Conversation({
  messages: loaded,
  me,
  canSend,
  sendHint,
  send,
  quickReplies = [],
  placeholder,
  emptyMessage,
  livePath,
}: {
  messages: ChatMessage[];
  /** Which side is reading: their messages sit on the right. */
  me: ChatMessage["from"];
  canSend: boolean;
  sendHint: string | null;
  send: (body: string) => Promise<void>;
  quickReplies?: { label: string; text: string }[];
  placeholder: string;
  emptyMessage: string;
  /** The conversation's live socket on this site, `/api/v1/.../live`. */
  livePath?: string;
}) {
  const router = useRouter();
  const action = useAction();
  const [draft, setDraft] = useState("");
  const { arrived, typing, live } = useLive(livePath, me);
  const messages = arrived.reduce(withMessage, loaded);
  // Whether you were reading the newest message when the view last moved.
  const atEnd = useRef(true);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    void action.run(async () => {
      await send(body);
      setDraft("");
      live.current?.sent();
      await router.invalidate();
    });
  }

  return (
    <Card className="h-[min(40rem,75vh)] gap-0 py-0">
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport
            aria-label="Messages"
            onScroll={(event) => {
              const view = event.currentTarget;
              atEnd.current =
                view.scrollHeight - view.scrollTop - view.clientHeight <= AT_END_WITHIN_PX;
            }}
          >
            <MessageScrollerContent className="gap-4 p-4">
              {messages.length === 0 && (
                <p className="text-muted-foreground text-sm">{emptyMessage}</p>
              )}
              {messages.map((message, index) => {
                const about = message.about?.jobTitle;
                // Says what the conversation turned to, when it changes.
                const turned = about && about !== aboutBefore(messages, index);
                const align = message.from === me ? "end" : "start";
                return (
                  // Drawn in full: off-screen placeholders change size as they render and
                  // nudge the view off the newest message.
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    className="[contain-intrinsic-size:none] [content-visibility:visible]"
                  >
                    {turned && (
                      <p className="pb-2 text-center text-muted-foreground text-xs">
                        About {about}
                      </p>
                    )}
                    {message.kind === "number_viewed" ? (
                      <p className="text-center text-muted-foreground text-xs">
                        {numberLine(message, me)} · {ago(message.createdAt)}
                      </p>
                    ) : (
                      <Message align={align}>
                        <MessageContent>
                          <MessageHeader>
                            {message.senderName ??
                              (message.from === "salon" ? "The salon" : "The job seeker")}{" "}
                            · {ago(message.createdAt)}
                          </MessageHeader>
                          <Bubble align={align} variant={align === "end" ? "default" : "muted"}>
                            <BubbleContent className="whitespace-pre-line">
                              {message.body}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                );
              })}
              {typing && (
                <p className="px-3 text-muted-foreground text-xs" aria-live="polite">
                  {typing} is typing…
                </p>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
          <FollowNewest newest={messages.at(-1)} typing={typing} me={me} atEnd={atEnd} />
        </MessageScroller>
      </MessageScrollerProvider>
      {canSend ? (
        <form onSubmit={submit} className="space-y-2 border-t p-4">
          {quickReplies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickReplies.map((reply) => (
                <Button
                  key={reply.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft(reply.text)}
                >
                  {reply.label}
                </Button>
              ))}
            </div>
          )}
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              live.current?.typing();
            }}
            placeholder={placeholder}
            maxLength={2000}
            rows={3}
            aria-label="Message"
          />
          <FormMessage message={action.message} />
          <div className="flex justify-end">
            <Button type="submit" disabled={action.pending || !draft.trim()}>
              {action.pending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      ) : (
        sendHint && <p className="border-t p-4 text-muted-foreground text-sm">{sendHint}</p>
      )}
    </Card>
  );
}

/** What the last real message before `index` was about (number looks aren't about anything). */
function aboutBefore(messages: ChatMessage[], index: number) {
  for (let i = index - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.kind === "text") return message.about?.jobTitle;
  }
  return undefined;
}

/** "Sam looked at your number", or "…their number" to the salon. */
function numberLine(message: ChatMessage, me: ChatMessage["from"]) {
  const who = message.senderName ?? (me === "seeker" ? "The salon" : "Someone on your team");
  return `${who} looked at ${me === "seeker" ? "your" : "their"} number`;
}

/** How close to the bottom still counts as reading the newest message. */
const AT_END_WITHIN_PX = 8;

/**
 * Keeps the newest message (and "typing…") in view: always after you send one, and when the
 * other side's arrives while you were at the bottom. Scrolled up to read, you're left there.
 * The scroller's own following stops for good after a scroll gesture that doesn't move the
 * view, so this doesn't rely on it.
 */
function FollowNewest({
  newest,
  typing,
  me,
  atEnd,
}: {
  newest: ChatMessage | undefined;
  typing: string | null;
  me: ChatMessage["from"];
  atEnd: RefObject<boolean>;
}) {
  const { scrollToEnd } = useMessageScroller();
  const shown = useRef({ id: newest?.id, typing });
  useLayoutEffect(() => {
    const arrived = newest?.id !== shown.current.id;
    const changed = arrived || typing !== shown.current.typing;
    shown.current = { id: newest?.id, typing };
    if ((arrived && newest?.from === me) || (changed && atEnd.current)) scrollToEnd();
  }, [newest, typing, me, atEnd, scrollToEnd]);
  return null;
}
