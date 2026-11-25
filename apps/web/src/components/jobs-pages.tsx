/**
 * The /jobs pages (D-07): landing pages by role and place, job ads (open or closed), and
 * keyword searches. The API's `by-path` says what's at an address; a renamed ad answers with a
 * redirect, which becomes a 301.
 */
import {
  AU_STATES,
  type AuState,
  type EmploymentType,
  JOB_ROLES,
  type JobRole,
  jobsLandingPath,
} from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Separator } from "@salonstaff/ui/components/separator";
import { notFound, redirect } from "@tanstack/react-router";
import { ApiProblem, api, type Schemas } from "@/lib/api";
import { ago, employmentLabel, formatDate, roleLabel } from "@/lib/format";
import { breadcrumbList, itemList, seo, withPage } from "@/lib/seo";
import { jobPosting } from "@/lib/structured-data";
import { AppLink } from "./app-link";
import { ApplyPanel } from "./apply-panel";
import { JobSearch, type JobSearchValues } from "./job-search";
import { Breadcrumbs, JobList, Pagination } from "./listing";
import { EmptyState, Page, Section } from "./page";

export type JobsLanding = Extract<Schemas["JobsPath"], { kind: "landing" }>;
export type JobAd = Extract<Schemas["JobsPath"], { kind: "job" }>;
export type JobsSearch = { kind: "search"; values: JobSearchValues; jobs: Schemas["JobSearch"] };
export type JobsPageData = JobsLanding | JobAd | JobsSearch;

export interface PageSearch {
  page?: number | undefined;
}

export const pageNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 && n <= 500 ? n : undefined;
};

/** Whatever's at a /jobs address: a landing page or an ad. Redirects and 404s are thrown. */
export async function loadJobsPath(path: string, page = 1): Promise<JobsLanding | JobAd> {
  const { data, error, response } = await api.GET("/v1/jobs/by-path", {
    params: { query: { path, page } },
  });
  if (response.status === 404 || response.status === 400) throw notFound();
  if (!data) throw new ApiProblem(response.status, error);
  if (data.kind === "redirect") throw redirect({ href: data.redirect, statusCode: 301 });
  // Past the last page of a listing: nothing here.
  if (data.kind === "landing" && page > 1 && page > data.jobs.pageCount) throw notFound();
  return data;
}

export async function searchJobs(values: JobSearchValues, page = 1): Promise<JobsSearch> {
  const { data, error, response } = await api.GET("/v1/jobs", {
    params: { query: { ...values, page } },
  });
  if (!data) throw new ApiProblem(response.status, error);
  return { kind: "search", values, jobs: data };
}

const describeJob = (job: Schemas["JobDetail"]) => {
  const pay = job.pay ? ` ${job.pay}.` : "";
  const text = job.description.replace(/\s+/g, " ").trim();
  const intro = `${employmentLabel(job.employmentType)} ${roleLabel(job.role).toLowerCase()} job at ${job.salon.name} in ${job.suburb} ${job.state}.${pay}`;
  const full = `${intro} ${text}`;
  return full.length > 160 ? `${full.slice(0, 157).trimEnd()}…` : full;
};

export function jobsHead(data: JobsPageData | undefined) {
  if (!data) return {};
  if (data.kind === "job") {
    const { job } = data;
    return seo({
      title: `${job.title} job in ${job.suburb} ${job.state} – ${job.salon.name}`,
      description: describeJob(job),
      path: job.path,
      noindex: data.noindex,
      ogType: "article",
      image: job.salon.logoUrl,
      jsonLd: [jobPosting(job), breadcrumbList(data.breadcrumbs)],
    });
  }
  if (data.kind === "search") {
    return seo({
      title: "Search hair and beauty jobs",
      description: "Search hair and beauty jobs across Australia.",
      path: "/jobs",
      noindex: true,
    });
  }
  const { jobs } = data;
  const count = jobs.total === 1 ? "1 live job" : `${jobs.total} live jobs`;
  return seo({
    title: jobs.page > 1 ? `${data.heading} (page ${jobs.page})` : data.heading,
    description: `${count}: ${data.heading.toLowerCase()}. Apply with one profile on Salon Staff.`,
    path: withPage(data.path, jobs.page),
    noindex: data.noindex,
    jsonLd: [
      breadcrumbList(data.breadcrumbs),
      itemList(
        jobs.items.map((job) => job.path),
        (jobs.page - 1) * jobs.pageSize,
      ),
    ],
  });
}

export function JobsPage({ data }: { data: JobsPageData }) {
  if (data.kind === "job") return <JobAdView ad={data} />;
  if (data.kind === "search") return <SearchView data={data} />;
  return <LandingView landing={data} />;
}

function LandingView({ landing }: { landing: JobsLanding }) {
  const { jobs } = landing;
  const values: JobSearchValues = {
    role: (landing.role ?? undefined) as JobRole | undefined,
    state: (landing.state ?? undefined) as AuState | undefined,
    suburb: landing.suburbSlug ?? undefined,
    suburbName: landing.suburbName ?? undefined,
  };
  return (
    <Page width="wide" className="space-y-6">
      <div>
        <Breadcrumbs crumbs={landing.breadcrumbs} />
        <h1 className="font-semibold text-2xl tracking-tight">{landing.heading}</h1>
        <p className="mt-1 text-muted-foreground">
          {jobs.total === 0
            ? "No live jobs here right now."
            : `${jobs.total} live job${jobs.total === 1 ? "" : "s"}, newest first.`}
        </p>
      </div>
      <JobSearch values={values} />
      {jobs.items.length > 0 ? (
        <JobList jobs={jobs.items} />
      ) : (
        <EmptyState
          title="No jobs here yet"
          description="Try a wider search, or check back soon."
          action={<AppLink href={jobsLandingPath({})}>See all jobs</AppLink>}
        />
      )}
      <Pagination path={landing.path} page={jobs.page} pageCount={jobs.pageCount} />
      {!landing.role && !landing.state && <Browse />}
    </Page>
  );
}

/** Links to every role and state page, so they're one click (and one crawl) away. */
function Browse() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Section title="Jobs by role">
        <ul className="grid gap-1 text-sm">
          {JOB_ROLES.map((role) => (
            <li key={role.value}>
              <AppLink href={jobsLandingPath({ role: role.value })} className="hover:underline">
                {role.label} jobs
              </AppLink>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Jobs by state">
        <ul className="grid gap-1 text-sm">
          {AU_STATES.map((state) => (
            <li key={state.value}>
              <AppLink href={jobsLandingPath({ state: state.value })} className="hover:underline">
                Jobs in {state.label}
              </AppLink>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function SearchView({ data }: { data: JobsSearch }) {
  const { jobs, values } = data;
  return (
    <Page width="wide" className="space-y-6">
      <div>
        <Breadcrumbs crumbs={[{ name: "Jobs", path: "/jobs" }]} />
        <h1 className="font-semibold text-2xl tracking-tight">Search jobs</h1>
        <p className="mt-1 text-muted-foreground">
          {jobs.total} job{jobs.total === 1 ? "" : "s"} found
          {values.q ? ` for "${values.q}"` : ""}
        </p>
      </div>
      <JobSearch values={values} />
      {jobs.items.length > 0 ? (
        <JobList jobs={jobs.items} />
      ) : (
        <EmptyState title="No jobs match" description="Try fewer words or a different filter." />
      )}
      <Pagination
        path="/jobs"
        page={jobs.page}
        pageCount={jobs.pageCount}
        search={{
          q: values.q,
          role: values.role,
          state: values.state,
          suburb: values.suburb,
          type: values.type as EmploymentType | undefined,
        }}
      />
    </Page>
  );
}

function JobAdView({ ad }: { ad: JobAd }) {
  const { job } = ad;
  return (
    <Page width="wide">
      <Breadcrumbs crumbs={ad.breadcrumbs} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <article className="min-w-0 space-y-6">
          <header className="space-y-2">
            {ad.closed && <Badge variant="outline">This job has closed</Badge>}
            <h1 className="font-semibold text-2xl tracking-tight">{job.title}</h1>
            <p>
              <AppLink href={job.salon.path} className="font-medium hover:underline">
                {job.salon.name}
              </AppLink>{" "}
              · {job.suburb} {job.state} {job.postcode}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{employmentLabel(job.employmentType)}</Badge>
              <Badge variant="secondary">{roleLabel(job.role)}</Badge>
              {job.pay && <span>{job.pay}</span>}
              {job.requireQualification && <Badge variant="outline">Qualification required</Badge>}
            </div>
            <p className="text-muted-foreground text-sm">
              {job.publishedAt && `Posted ${ago(job.publishedAt)}`}
              {job.expiresAt && !ad.closed && ` · Closes ${formatDate(job.expiresAt)}`}
            </p>
          </header>
          <Separator />
          <Section title="About the role">
            <p className="whitespace-pre-line leading-relaxed">{job.description}</p>
          </Section>
          {job.requirements && (
            <Section title="What you'll need">
              <p className="whitespace-pre-line leading-relaxed">{job.requirements}</p>
            </Section>
          )}
          {ad.closed && (
            <Section title="Similar jobs">
              {ad.similar.length > 0 ? (
                <JobList jobs={ad.similar} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No similar jobs right now.{" "}
                  <AppLink
                    href={jobsLandingPath({ role: job.role as JobRole })}
                    className="underline"
                  >
                    See all {roleLabel(job.role).toLowerCase()} jobs
                  </AppLink>
                </p>
              )}
            </Section>
          )}
        </article>
        <aside className="space-y-4">
          <ApplyPanel job={job} viewer={ad.viewer} />
        </aside>
      </div>
    </Page>
  );
}
