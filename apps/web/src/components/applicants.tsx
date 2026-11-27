/**
 * A salon's applicants (D-17): filters, status counts and the list. Used by the Applicants page
 * (every job) and each job's page.
 */
import { APPLICANT_SORTS, APPLICATION_STATUSES, type ApplicantSort } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { Input } from "@salonstaff/ui/components/input";
import { cn } from "@salonstaff/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { selectClass } from "@/components/form";
import { EmptyState } from "@/components/page";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { formatDate, rightToWorkLabel } from "@/lib/format";

type Status = Schemas["Applicant"]["status"];
type Check = "identity" | "right_to_work" | "qualification";

/** The filters, as they sit in the page's address. */
export interface ApplicantSearch {
  status?: Status | undefined;
  job?: string | undefined;
  unread?: boolean | undefined;
  verified?: string | undefined;
  openToWork?: boolean | undefined;
  minYears?: number | undefined;
  q?: string | undefined;
  sort?: ApplicantSort | undefined;
}

const STATUS_VALUES = new Set<string>(APPLICATION_STATUSES.map((s) => s.value));
const SORT_VALUES = new Set<string>(APPLICANT_SORTS.map((s) => s.value));
const CHECKS: { value: Check; label: string }[] = [
  { value: "identity", label: "ID verified" },
  { value: "right_to_work", label: "Work rights checked" },
  { value: "qualification", label: "Qualification verified" },
];

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export function validateApplicantSearch(search: Record<string, unknown>): ApplicantSearch {
  const years = Number(search.minYears);
  return {
    status: STATUS_VALUES.has(String(search.status)) ? (search.status as Status) : undefined,
    job: text(search.job),
    unread: search.unread === true || search.unread === "true" ? true : undefined,
    verified: text(search.verified),
    openToWork: search.openToWork === true || search.openToWork === "true" ? true : undefined,
    minYears: Number.isInteger(years) && years > 0 && years <= 60 ? years : undefined,
    q: text(search.q),
    sort: SORT_VALUES.has(String(search.sort)) ? (search.sort as ApplicantSort) : undefined,
  };
}

/** Loads the applicants the filters match (`jobId` for one job's page). */
export async function loadApplicants(salonId: string, search: ApplicantSearch, jobId?: string) {
  return unwrap(
    await api.GET("/v1/employer/salons/{salonId}/applicants", {
      params: {
        path: { salonId },
        query: {
          jobId: jobId ?? search.job,
          status: search.status,
          unread: search.unread ? "true" : undefined,
          verified: search.verified,
          openToWork: search.openToWork ? "true" : undefined,
          minYears: search.minYears,
          q: search.q,
          sort: search.sort ?? "newest",
        },
      },
    }),
  );
}

export function ApplicantsBrowser({
  salonId,
  data,
  search,
  onSearch,
  jobs,
  emptyMessage,
}: {
  salonId: string;
  data: Schemas["SalonApplicants"];
  search: ApplicantSearch;
  onSearch: (next: ApplicantSearch) => void;
  /** To filter by job, on the page for every job. */
  jobs?: { id: string; title: string }[];
  emptyMessage: string;
}) {
  const set = (patch: Partial<ApplicantSearch>) => onSearch({ ...search, ...patch });
  const verified = new Set((search.verified ?? "").split(",").filter(Boolean));
  const filtered =
    search.job ||
    search.unread ||
    search.verified ||
    search.openToWork ||
    search.minYears ||
    search.q;

  function toggleCheck(check: Check, on: boolean) {
    const next = new Set(verified);
    if (on) next.add(check);
    else next.delete(check);
    set({ verified: [...next].join(",") || undefined });
  }

  function searchName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q");
    set({ q: typeof q === "string" && q.trim() ? q.trim() : undefined });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Status">
        <Button
          size="sm"
          variant={search.status ? "ghost" : "secondary"}
          onClick={() => set({ status: undefined })}
        >
          All <span className="text-muted-foreground">{data.total}</span>
        </Button>
        {APPLICATION_STATUSES.map((s) => (
          <Button
            key={s.value}
            size="sm"
            variant={search.status === s.value ? "secondary" : "ghost"}
            onClick={() => set({ status: s.value })}
          >
            {s.value === "submitted" ? "New" : s.label}{" "}
            <span className="text-muted-foreground">{data.counts[s.value] ?? 0}</span>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <form onSubmit={searchName} className="flex gap-2">
          <Input
            name="q"
            defaultValue={search.q ?? ""}
            placeholder="Search by name"
            className="w-48"
            aria-label="Search by name"
          />
        </form>
        {jobs && (
          <select
            className={cn(selectClass, "w-auto")}
            value={search.job ?? ""}
            onChange={(e) => set({ job: e.target.value || undefined })}
            aria-label="Job"
          >
            <option value="">All jobs</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
        )}
        <select
          className={cn(selectClass, "w-auto")}
          value={search.sort ?? "newest"}
          onChange={(e) => set({ sort: e.target.value as ApplicantSort })}
          aria-label="Sort"
        >
          {APPLICANT_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={cn(selectClass, "w-auto")}
          value={search.minYears ?? ""}
          onChange={(e) => set({ minYears: e.target.value ? Number(e.target.value) : undefined })}
          aria-label="Experience"
        >
          <option value="">Any experience</option>
          {[1, 2, 3, 5, 10].map((y) => (
            <option key={y} value={y}>
              {y}+ years
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Check
          label="Unread replies"
          checked={!!search.unread}
          onChange={(on) => set({ unread: on || undefined })}
        />
        <Check
          label="Open to work"
          checked={!!search.openToWork}
          onChange={(on) => set({ openToWork: on || undefined })}
        />
        {CHECKS.map((check) => (
          <Check
            key={check.value}
            label={check.label}
            checked={verified.has(check.value)}
            onChange={(on) => toggleCheck(check.value, on)}
          />
        ))}
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSearch({ status: search.status, sort: search.sort })}
          >
            Clear filters
          </Button>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={filtered || search.status ? "Nobody matches" : "No applicants yet"}
          description={filtered || search.status ? "Try fewer filters." : emptyMessage}
        />
      ) : (
        <div className="grid gap-3">
          {data.items.map((applicant) => (
            <ApplicantCard
              key={applicant.id}
              applicant={applicant}
              salonId={salonId}
              showJob={!!jobs}
            />
          ))}
          {data.truncated && (
            <p className="text-muted-foreground text-sm">
              Showing the first {data.items.length}. Narrow the filters to see the rest.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Where an application is up to, changed in place. */
export function StatusSelect({
  salonId,
  applicationId,
  status: initial,
}: {
  salonId: string;
  applicationId: string;
  status: Status;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(false);
  async function change(next: Status) {
    const before = status;
    setStatus(next);
    setPending(true);
    try {
      unwrap(
        await api.PATCH("/v1/employer/salons/{salonId}/applications/{id}", {
          params: { path: { salonId, id: applicationId } },
          body: { status: next },
        }),
      );
      toast.success("Status updated");
      void router.invalidate();
    } catch (error) {
      setStatus(before);
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <label className="flex items-center gap-2">
      <span className="text-muted-foreground">Status</span>
      <select
        className={cn(selectClass, "w-auto")}
        value={status}
        disabled={pending}
        onChange={(event) => change(event.target.value as Status)}
      >
        {APPLICATION_STATUSES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One applicant: who they are, what's verified, where it's up to, and the conversation. */
export function ApplicantCard({
  applicant,
  salonId,
  showJob,
}: {
  applicant: Schemas["SalonApplicant"];
  salonId: string;
  showJob: boolean;
}) {
  const person = applicant.candidate;
  const v = applicant.verification;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {person ? (
            <Link
              to="/employer/$salonId/applications/$id"
              params={{ salonId, id: applicant.id }}
              className="hover:underline"
            >
              {person.firstName} {person.lastName}
            </Link>
          ) : (
            "Deleted account"
          )}
          {applicant.isNew && <Badge>New</Badge>}
          {applicant.unreadMessages > 0 && (
            <Badge>
              {applicant.unreadMessages} unread{" "}
              {applicant.unreadMessages === 1 ? "reply" : "replies"}
            </Badge>
          )}
          {v.identity === "verified" && <Badge variant="secondary">ID verified</Badge>}
          {v.rightToWork === "verified" && <Badge variant="secondary">Work rights checked</Badge>}
          {v.qualification === "verified" && (
            <Badge variant="secondary">Qualification verified</Badge>
          )}
        </CardTitle>
        {person && (
          <CardDescription>
            {showJob && `${applicant.job.title} · `}
            {person.headline && `${person.headline} · `}
            {person.suburb} {person.state} · {person.yearsExperience ?? 0} yrs ·{" "}
            {rightToWorkLabel(person.rightToWork)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {applicant.coverNote && (
          <p className="line-clamp-3 whitespace-pre-line">{applicant.coverNote}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <StatusSelect salonId={salonId} applicationId={applicant.id} status={applicant.status} />
          <span className="text-muted-foreground">Applied {formatDate(applicant.createdAt)}</span>
          {person && (
            <div className="ml-auto flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link
                  to="/employer/$salonId/candidates/$id"
                  params={{ salonId, id: applicant.candidateId }}
                >
                  Full profile
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link
                  to="/employer/$salonId/applications/$id"
                  params={{ salonId, id: applicant.id }}
                >
                  {applicant.lastMessageAt ? "Messages" : "Message"}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
