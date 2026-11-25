import {
  AU_STATE_VALUES,
  type AuState,
  EMPLOYMENT_TYPE_VALUES,
  type EmploymentType,
  JOB_ROLE_VALUES,
  type JobRole,
  slugify,
} from "@salonstaff/shared";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type JobSearchValues, searchHref } from "@/components/job-search";
import { JobsPage, jobsHead, loadJobsPath, pageNumber, searchJobs } from "@/components/jobs-pages";

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.includes(value as T) ? (value as T) : undefined;

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

interface JobsSearchParams extends JobSearchValues {
  page?: number | undefined;
}

/**
 * /jobs: every live job. With a keyword, an employment type or a suburb without a state it's a
 * search (not indexed); role, state and suburb alone redirect to their landing page.
 */
export const Route = createFileRoute("/jobs/")({
  validateSearch: (search: Record<string, unknown>): JobsSearchParams => ({
    q: text(search.q, 100),
    role: oneOf<JobRole>(JOB_ROLE_VALUES, search.role),
    state: oneOf<AuState>(AU_STATE_VALUES, search.state),
    suburb: slugify(text(search.suburb, 80) ?? "") || undefined,
    type: oneOf<EmploymentType>(EMPLOYMENT_TYPE_VALUES, search.type),
    page: pageNumber(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const { page, ...values } = deps;
    if (values.q || values.type || (values.suburb && !values.state)) {
      return searchJobs(values, page);
    }
    if (values.role || values.state) {
      throw redirect({ href: searchHref(values), statusCode: 301 });
    }
    return loadJobsPath("/jobs", page);
  },
  head: ({ loaderData }) => jobsHead(loaderData),
  component: JobsIndex,
});

function JobsIndex() {
  return <JobsPage data={Route.useLoaderData()} />;
}
