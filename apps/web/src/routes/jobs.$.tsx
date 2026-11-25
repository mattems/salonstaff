import { createFileRoute } from "@tanstack/react-router";
import {
  JobsPage,
  jobsHead,
  loadJobsPath,
  type PageSearch,
  pageNumber,
} from "@/components/jobs-pages";

/** /jobs/{role|state}/… : landing pages and job ads (D-07). */
export const Route = createFileRoute("/jobs/$")({
  validateSearch: (search: Record<string, unknown>): PageSearch => ({
    page: pageNumber(search.page),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ params, deps }) => loadJobsPath(`/jobs/${params._splat ?? ""}`, deps.page),
  head: ({ loaderData }) => jobsHead(loaderData),
  component: JobsSplat,
});

function JobsSplat() {
  return <JobsPage data={Route.useLoaderData()} />;
}
