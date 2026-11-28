/** Jobs in a table, at one salon or across all of them (D-20). */
import { Badge } from "@salonstaff/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { cn } from "@salonstaff/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { selectClass } from "@/components/form";
import type { Schemas } from "@/lib/api";
import { formatDate } from "@/lib/format";

export const JOB_STATUS = {
  draft: "Draft",
  published: "Live",
  expired: "Expired",
  closed: "Closed",
} as const;

export function JobsTable({
  jobs,
  showSalon,
}: {
  jobs: Schemas["SalonJob"][];
  /** A column saying which salon, when they're from several. */
  showSalon: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          {showSalon && <TableHead>Salon</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead>Applicants</TableHead>
          <TableHead>Live until</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell>
              <Link
                to="/employer/$salonId/jobs/$id"
                params={{ salonId: job.salon.id, id: job.id }}
                className="font-medium hover:underline"
              >
                {job.title}
              </Link>
              <span className="block text-muted-foreground text-xs">
                {job.suburb} {job.state}
              </span>
            </TableCell>
            {showSalon && <TableCell className="text-muted-foreground">{job.salon.name}</TableCell>}
            <TableCell>
              <Badge variant={job.status === "published" ? "default" : "outline"}>
                {JOB_STATUS[job.status]}
              </Badge>
            </TableCell>
            <TableCell>
              <Link
                to="/employer/applicants"
                search={{ salon: job.salon.id, job: job.id }}
                className="hover:underline"
              >
                {job.applicants}
              </Link>
              {job.newApplicants > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {job.newApplicants} new
                </Badge>
              )}
            </TableCell>
            <TableCell>{job.status === "published" ? formatDate(job.expiresAt) : "–"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Picks one of your salons, or all of them, for a list's `?salon=`. */
export function SalonFilter({
  salons,
  value,
  onChange,
}: {
  salons: { id: string; name: string }[];
  value: string | undefined;
  onChange: (salonId: string | undefined) => void;
}) {
  if (salons.length < 2) return null;
  return (
    <select
      className={cn(selectClass, "w-auto")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label="Salon"
    >
      <option value="">All salons</option>
      {salons.map((salon) => (
        <option key={salon.id} value={salon.id}>
          {salon.name}
        </option>
      ))}
    </select>
  );
}
