export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text version. Every email has one. */
  text: string;
  /** Shown as the sender in place of our own name, at our address. */
  fromName?: string;
  /** Extra headers, e.g. `List-Unsubscribe`. Values are ours, never a customer's text. */
  headers?: Record<string, string>;
  /** In place of the configured sender, for mail sent from another domain of ours. */
  from?: string;
  /** Where replies go: an account's own address, e.g. a salon messaging a job seeker (D-13). */
  replyTo?: string;
  /**
   * Names and values the provider sends back with a bounce or complaint, so the email can be
   * traced without its address. Letters, digits, `_` and `-` only. Resend alone has them.
   */
  tags?: Record<string, string>;
}

/** The one thing the rest of the app knows about sending email. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export type EmailConfig =
  /** Local development: delivers to the Mailpit inbox at http://localhost:8026. */
  | { provider: "mailpit"; from: string; url: string }
  | { provider: "resend"; from: string; apiKey: string }
  | { provider: "postmark"; from: string; serverToken: string };

type Fetch = typeof fetch;

/**
 * The provider answered, and said no. `status` tells a caller whether trying again could help.
 * `code` is the provider's own short name for the refusal (`validation_error`), when it gave
 * one: safe to keep where the message isn't, because it can't quote an address.
 */
export class EmailRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "EmailRejectedError";
  }
}

/** The `name` in a provider's JSON refusal, if it is a plain identifier and nothing more. */
function errorName(detail: string): string | null {
  try {
    const { name } = JSON.parse(detail) as { name?: unknown };
    return typeof name === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(name) ? name : null;
  } catch {
    return null;
  }
}

async function post(
  fetcher: Fetch,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new EmailRejectedError(
      `${provider} rejected the email (${response.status}): ${detail}`,
      response.status,
      errorName(detail),
    );
  }
}

/** Splits `Name <address>` into its parts. A bare address has no name. */
function parseFrom(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: from.trim() };
  const [, name, email] = match;
  return name ? { name, email: email as string } : { email: email as string };
}

/** `from` under another display name. Quotes and control characters can't appear in one. */
const displayName = (name: string | undefined) =>
  name?.replace(/["\\<>\r\n]/g, "").trim() || undefined;

function fromAs(from: string, name: string | undefined): string {
  const clean = displayName(name);
  return clean ? `"${clean}" <${parseFrom(from).email}>` : from;
}

export function createEmailSender(config: EmailConfig, fetcher: Fetch = fetch): EmailSender {
  switch (config.provider) {
    case "mailpit": {
      return {
        send: (m) => {
          const from = parseFrom(m.from ?? config.from);
          return post(
            fetcher,
            "Mailpit",
            `${config.url}/api/v1/send`,
            {},
            {
              From: { Email: from.email, Name: displayName(m.fromName) ?? from.name ?? "" },
              To: [{ Email: m.to }],
              Subject: m.subject,
              HTML: m.html,
              Text: m.text,
              ...(m.replyTo ? { ReplyTo: [{ Email: m.replyTo }] } : {}),
              ...(m.headers ? { Headers: m.headers } : {}),
            },
          );
        },
      };
    }
    case "resend":
      return {
        send: (m) =>
          post(
            fetcher,
            "Resend",
            "https://api.resend.com/emails",
            { Authorization: `Bearer ${config.apiKey}` },
            {
              from: fromAs(m.from ?? config.from, m.fromName),
              to: [m.to],
              subject: m.subject,
              html: m.html,
              text: m.text,
              ...(m.replyTo ? { reply_to: m.replyTo } : {}),
              ...(m.headers ? { headers: m.headers } : {}),
              ...(m.tags
                ? { tags: Object.entries(m.tags).map(([name, value]) => ({ name, value })) }
                : {}),
            },
          ),
      };
    case "postmark":
      return {
        send: (m) =>
          post(
            fetcher,
            "Postmark",
            "https://api.postmarkapp.com/email",
            { "X-Postmark-Server-Token": config.serverToken },
            {
              From: fromAs(m.from ?? config.from, m.fromName),
              To: m.to,
              Subject: m.subject,
              HtmlBody: m.html,
              TextBody: m.text,
              ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
              ...(m.headers
                ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) }
                : {}),
              MessageStream: "outbound",
            },
          ),
      };
  }
}
