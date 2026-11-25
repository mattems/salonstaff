import {
  APPLICATION_STATUSES,
  AU_STATES,
  EMPLOYMENT_TYPES,
  JOB_ROLES,
  labelFor,
  RIGHT_TO_WORK,
} from "@salonstaff/shared";

export const roleLabel = (value: string) => labelFor(JOB_ROLES, value);
export const stateLabel = (value: string) => labelFor(AU_STATES, value);
export const employmentLabel = (value: string) => labelFor(EMPLOYMENT_TYPES, value);
export const rightToWorkLabel = (value: string) => labelFor(RIGHT_TO_WORK, value);
export const applicationStatusLabel = (value: string) => labelFor(APPLICATION_STATUSES, value);

const DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Australia/Sydney",
});

export const formatDate = (value: string | null | undefined) =>
  value ? DATE.format(new Date(value)) : "";

export const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;

/** "3 days ago", from an ISO date. */
export function ago(value: string | null | undefined): string {
  if (!value) return "";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2022-03" → "Mar 2022"; null → "Present". */
export function formatMonth(month: string | null): string {
  if (!month) return "Present";
  const [year, number] = month.split("-").map(Number);
  return `${MONTHS[(number ?? 1) - 1]} ${year}`;
}

/** "Jane Citizen" → "JC". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
