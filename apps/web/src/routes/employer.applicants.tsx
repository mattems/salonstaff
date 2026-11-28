import { createFileRoute } from "@tanstack/react-router";
import {
  ApplicantsBrowser,
  loadApplicants,
  validateApplicantSearch,
} from "@/components/applicants";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

/** Everyone who applied for any job at any of your salons, filtered (D-17, D-20). */
export const Route = createFileRoute("/employer/applicants")({
  validateSearch: validateApplicantSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [applicants, jobs] = await Promise.all([
      loadApplicants(deps),
      api.GET("/v1/employer/jobs"),
    ]);
    return { applicants, jobs: unwrap(jobs).items };
  },
  head: () => privatePage("Applicants"),
  component: Applicants,
});

function Applicants() {
  const { applicants, jobs } = Route.useLoaderData();
  const { salons } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Applicants"
        description="Everyone who applied for your jobs. Move them along, open their profile or message them."
      />
      <ApplicantsBrowser
        data={applicants}
        search={search}
        onSearch={(next) => void navigate({ search: next, replace: true })}
        jobs={jobs.map((job) => ({
          id: job.id,
          title: salons.length > 1 ? `${job.title} (${job.salon.name})` : job.title,
          salonId: job.salon.id,
        }))}
        salons={salons}
        emptyMessage="When someone applies for one of your jobs, they show up here."
      />
    </div>
  );
}
