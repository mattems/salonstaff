import { CardTable } from "@salonstaff/ui/card-table";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@salonstaff/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ActionDialog } from "@/components/action-dialog";
import { EmptyList, FormError, PageHeader, Section, useCursors } from "@/components/page";
import { api, errorMessage, unwrap } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { can, type JobFilters, jobsQuery, meQuery } from "@/lib/queries";

const APP_URL = import.meta.env.VITE_APP_URL;
const ALL = "all";
const FILTERS = ["live", "expired", "draft", "closed", "featured"] as const;

export function validateJobsSearch(search: Record<string, unknown>): JobFilters {
  const status = FILTERS.find((value) => value === search.status);
  return {
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(status ? { status } : {}),
  };
}

interface JobLike {
  id: string;
  title: string;
  status: "draft" | "live" | "expired" | "closed";
  featured: boolean;
}

export function JobStatus({ job }: { job: JobLike }) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant={job.status === "live" ? "secondary" : "outline"}>
        {humanize(job.status)}
      </Badge>
      {job.featured ? <Badge>Featured</Badge> : null}
    </span>
  );
}

/** Feature, take down, or relist for free. */
export function JobActions({ job }: { job: JobLike }) {
  const path = { params: { path: { id: job.id } } };
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <ActionDialog
        label={job.featured ? "Unfeature" : "Feature"}
        title={job.featured ? "Stop featuring this job" : "Feature this job"}
        description={job.title}
        run={async () =>
          unwrap(
            await api.POST("/admin/v1/jobs/{id}/feature", {
              ...path,
              body: { featured: !job.featured },
            }),
          )
        }
        done={job.featured ? "No longer featured" : "Job featured"}
      />
      {job.status === "live" || job.status === "expired" || job.status === "draft" ? (
        <ActionDialog
          label="Take down"
          destructive
          title="Take this job down"
          description={`${job.title}. It closes at once.`}
          reason={{
            label: "Reason",
            placeholder: "e.g. scam, spam, discriminatory",
            required: true,
            hint: "Recorded in the audit log.",
          }}
          run={async (reason) =>
            unwrap(await api.POST("/admin/v1/jobs/{id}/take-down", { ...path, body: { reason } }))
          }
          done="Job taken down"
        />
      ) : null}
      {job.status !== "live" ? (
        <ActionDialog
          label="Relist free"
          title="Relist this job for free"
          description={`${job.title}. It goes live for 30 days, without charging the salon.`}
          run={async () => unwrap(await api.POST("/admin/v1/jobs/{id}/relist", path))}
          done="Job relisted"
        />
      ) : null}
    </div>
  );
}

export function JobsPage() {
  const filters = useSearch({ from: "/jobs" });
  const navigate = useNavigate({ from: "/jobs" });
  const me = useQuery(meQuery).data;
  const [draft, setDraft] = useState(filters.q ?? "");
  const { cursor, reset, pager } = useCursors();
  const jobs = useQuery(jobsQuery(filters, cursor));
  const rows = jobs.data?.data ?? [];
  const set = (patch: Partial<JobFilters>) => {
    reset();
    navigate({ search: validateJobsSearch({ ...filters, ...patch }) });
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    set({ q: draft.trim() || undefined });
  };

  return (
    <>
      <PageHeader title="Jobs" description="Every job ad, newest first." />
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Title, salon or suburb"
          aria-label="Search jobs"
          className="min-w-52 flex-1"
        />
        <Button type="submit" variant="outline">
          <Search />
          Search
        </Button>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) =>
            set({ status: value === ALL ? undefined : (value as JobFilters["status"]) })
          }
        >
          <SelectTrigger className="w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {humanize(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>
      <FormError message={jobs.isError ? errorMessage(jobs.error) : null} />
      <Section>
        <CardTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Salon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applicants</TableHead>
                <TableHead>Until</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <a
                      href={`${APP_URL}${job.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium"
                    >
                      {job.title}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      {job.suburb}, {job.state}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link to="/salons/$salonId" params={{ salonId: job.salon.id }}>
                      {job.salon.name}
                    </Link>
                    {job.salon.status !== "active" ? (
                      <Badge variant="destructive" className="ml-2">
                        {humanize(job.salon.status)}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <JobStatus job={job} />
                  </TableCell>
                  <TableCell className="tabular-nums">{job.applicants}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(job.expires_at)}</TableCell>
                  <TableCell className="text-right">
                    {can(me, "jobs:moderate") ? <JobActions job={job} /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardTable>
        {jobs.isSuccess && rows.length === 0 ? <EmptyList>No jobs match.</EmptyList> : null}
      </Section>
      {pager(jobs.data?.next_cursor)}
    </>
  );
}
