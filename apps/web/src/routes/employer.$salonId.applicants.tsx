import { createFileRoute } from "@tanstack/react-router";
import {
  ApplicantsBrowser,
  loadApplicants,
  validateApplicantSearch,
} from "@/components/applicants";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

/** Everyone who applied for the salon's jobs, filtered (D-17). */
export const Route = createFileRoute("/employer/$salonId/applicants")({
  validateSearch: validateApplicantSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const [applicants, jobs] = await Promise.all([
      loadApplicants(params.salonId, deps),
      api.GET("/v1/employer/salons/{salonId}/jobs", {
        params: { path: { salonId: params.salonId } },
      }),
    ]);
    return { applicants, jobs: unwrap(jobs).items };
  },
  head: () => privatePage("Applicants"),
  component: Applicants,
});

function Applicants() {
  const { applicants, jobs } = Route.useLoaderData();
  const search = Route.useSearch();
  const { salonId } = Route.useParams();
  const navigate = Route.useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Applicants"
        description="Everyone who applied for your jobs. Open one to read and reply to their messages."
      />
      <ApplicantsBrowser
        salonId={salonId}
        data={applicants}
        search={search}
        onSearch={(next) => void navigate({ search: next, replace: true })}
        jobs={jobs.map((job) => ({ id: job.id, title: job.title }))}
        emptyMessage="When someone applies for one of your jobs, they show up here."
      />
    </div>
  );
}
