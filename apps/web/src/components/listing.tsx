/** Pieces of the public listing pages: breadcrumbs, job and salon cards, pagination. */
import { Badge } from "@salonstaff/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@salonstaff/ui/components/breadcrumb";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { Fragment } from "react";
import type { Schemas } from "@/lib/api";
import { ago, employmentLabel } from "@/lib/format";
import { AppLink } from "./app-link";
import { distanceText } from "./near-me";
import { SalonLogo } from "./salon-brand";

export type Crumb = { name: string; path: string };

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;
  const all = [{ name: "Home", path: "/" }, ...crumbs];
  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {all.map((crumb, index) => (
          <Fragment key={crumb.path}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {index === all.length - 1 ? (
                <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <AppLink href={crumb.path}>{crumb.name}</AppLink>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** A job, and how far away it is when the search was near a point. */
type ListedJob = Schemas["JobSummary"] & { distanceKm?: number | null };

export function JobCard({ job, action }: { job: ListedJob; action?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <AppLink href={job.path} className="hover:underline">
            {job.title}
          </AppLink>
        </CardTitle>
        <CardDescription>
          <AppLink href={job.salon.path} className="hover:underline">
            {job.salon.name}
          </AppLink>{" "}
          · {job.suburb} {job.state}
          {distanceText(job.distanceKm) && ` · ${distanceText(job.distanceKm)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{employmentLabel(job.employmentType)}</Badge>
        {job.pay && <span>{job.pay}</span>}
        {job.featured && <Badge variant="outline">Featured</Badge>}
        {job.closed && <Badge variant="outline">Closed</Badge>}
        {job.publishedAt && !job.closed && (
          <span className="text-muted-foreground">Posted {ago(job.publishedAt)}</span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </CardContent>
    </Card>
  );
}

export function JobList({ jobs }: { jobs: ListedJob[] }) {
  return (
    <div className="grid gap-3">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

export function SalonCard({ salon }: { salon: Schemas["DirectorySalon"] }) {
  return (
    <Card size="sm" className="relative transition-colors hover:bg-muted/40">
      <CardHeader className="flex flex-row items-center gap-3">
        <SalonLogo name={salon.name} logoUrl={salon.logoUrl} />
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">
            {/* The whole card is the link. */}
            <AppLink href={salon.path} className="after:absolute after:inset-0">
              {salon.name}
            </AppLink>
          </CardTitle>
          <CardDescription>
            {salon.suburb} {salon.state}
            {distanceText(salon.distanceKm) && ` · ${distanceText(salon.distanceKm)}`}
          </CardDescription>
        </div>
      </CardHeader>
      {(salon.liveJobs > 0 || salon.verified) && (
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          {salon.liveJobs > 0 && (
            <Badge variant="secondary">
              Hiring: {salon.liveJobs} job{salon.liveJobs === 1 ? "" : "s"}
            </Badge>
          )}
          {salon.verified && <Badge variant="outline">Verified business</Badge>}
        </CardContent>
      )}
    </Card>
  );
}

/** Previous / next links as `?page=`. Plain links, so search engines follow them. */
export function Pagination({
  path,
  page,
  pageCount,
  search,
}: {
  path: string;
  page: number;
  pageCount: number;
  /** Other query values to keep (search filters). */
  search?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search ?? {})) if (value) params.set(key, value);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Button asChild variant="outline">
          <a href={href(page - 1)} rel="prev">
            Previous
          </a>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground text-sm">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Button asChild variant="outline">
          <a href={href(page + 1)} rel="next">
            Next
          </a>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
