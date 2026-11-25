import type { AuditEvent } from "./queries";

const dateFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const relative = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });
const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

/** `1 Oct 2026` */
export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFormat.format(new Date(iso)) : "–";
}

/** `12 Oct, 09:14` */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** `$49.00` from cents. */
export const formatMoney = (cents: number) => money.format(cents / 100);

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** `2 hours ago`, `in 6 days`, `just now` */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

/** `pending_review` → `Pending review` */
export const humanize = (value: string | null | undefined) =>
  value ? (value.charAt(0).toUpperCase() + value.slice(1)).replaceAll("_", " ") : "–";

export const CHECK_KINDS: Record<string, string> = {
  identity: "ID",
  right_to_work: "Right to work",
  qualification: "Qualification",
};

export const CLAIM_STATUSES: Record<string, string> = {
  pending_email: "Waiting for the email link",
  pending_review: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
};

export const PAYMENT_KINDS: Record<string, string> = {
  single_listing: "Single listing",
  salon_plan: "Salon Plan",
  founding_plan: "Salon Plan (founding)",
};

const field = (value: unknown, key: string): string | undefined => {
  const found = (value as Record<string, unknown> | null)?.[key];
  return typeof found === "string" || typeof found === "number" || typeof found === "boolean"
    ? String(found)
    : undefined;
};

/** The detail that goes with an audit event's action, e.g. `support → readonly`. Empty when there is none. */
export function describeChange(event: Pick<AuditEvent, "action" | "before" | "after">): string {
  const { before, after } = event;
  switch (event.action) {
    case "staff.role_changed":
    case "user.role_changed":
      return `${field(before, "role")} → ${field(after, "role")}`;
    case "staff.added":
      return [field(after, "email"), field(after, "role")].filter(Boolean).join(", ");
    case "staff.removed":
      return field(before, "email") ?? "";
    case "salon.credits_changed": {
      const delta = Number(field(after, "delta") ?? 0);
      return `${delta > 0 ? "+" : ""}${delta} (${field(before, "credits")} → ${field(after, "credits")})`;
    }
    case "salon.free_period_extended":
      return `+${field(after, "days")} days, until ${formatDate(field(after, "free_until"))}`;
    case "salon.suspended":
    case "salon.removed":
    case "salon.reinstated":
      return `${field(before, "status")} → ${field(after, "status")}`;
    case "user.banned":
    case "user.signed_out_everywhere":
      return `${field(after, "sessions_ended") ?? 0} sessions ended`;
    case "user.deleted":
      return [field(before, "name"), field(before, "email")].filter(Boolean).join(", ");
    case "salon.deleted":
      return field(before, "name") ?? "";
    case "directory.imported":
      return `${field(after, "added")} added, ${field(after, "duplicates")} duplicates, ${field(after, "errors")} errors`;
    case "directory.listing_added":
      return field(after, "name") ?? "";
    case "job.relisted":
      return `until ${formatDate(field(after, "expires_at"))}`;
    default:
      return "";
  }
}
