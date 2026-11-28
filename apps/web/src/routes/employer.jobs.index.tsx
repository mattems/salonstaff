import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@salonstaff/ui/components/tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader } from "@/components/page";
import { JobsTable, SalonFilter } from "@/components/salon-jobs";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

const SHOWS = ["live", "drafts", "ended", "all"] as const;
type Show = (typeof SHOWS)[number];

interface JobsSearch {
  salon?: string | undefined;
  show?: Show | undefined;
}

/** Every job at every salon you're on (D-20), or one salon's (`?salon=`). */
export const Route = createFileRoute("/employer/jobs/")({
  validateSearch: (search: Record<string, unknown>): JobsSearch => ({
    salon: typeof search.salon === "string" ? search.salon : undefined,
    show: SHOWS.includes(search.show as Show) ? (search.show as Show) : undefined,
  }),
  loaderDeps: ({ search }) => ({ salon: search.salon }),
  loader: async ({ deps }) =>
    unwrap(await api.GET("/v1/employer/jobs", { params: { query: { salonId: deps.salon } } }))
      .items,
  head: () => privatePage("Jobs"),
  component: Jobs,
});

const MATCHES: Record<Show, (status: string) => boolean> = {
  live: (s) => s === "published",
  drafts: (s) => s === "draft",
  ended: (s) => s === "closed" || s === "expired",
  all: () => true,
};

function Jobs() {
  const jobs = Route.useLoaderData();
  const { salons } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const show = search.show ?? "live";
  const shown = jobs.filter((job) => MATCHES[show](job.status));
  const count = (s: Show) => jobs.filter((job) => MATCHES[s](job.status)).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description={
          salons.length > 1
            ? "Every job at your salons. Open one to edit it, relist it or see who applied."
            : "Your jobs. Open one to edit it, relist it or see who applied."
        }
        actions={
          <Button asChild>
            <Link to="/employer/jobs/new" search={{ salon: search.salon }}>
              Post a job
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={show}
          onValueChange={(value) =>
            void navigate({ search: (s) => ({ ...s, show: value as Show }), replace: true })
          }
        >
          <TabsList>
            <TabsTrigger value="live">Live {count("live")}</TabsTrigger>
            <TabsTrigger value="drafts">Drafts {count("drafts")}</TabsTrigger>
            <TabsTrigger value="ended">Ended {count("ended")}</TabsTrigger>
            <TabsTrigger value="all">All {jobs.length}</TabsTrigger>
          </TabsList>
        </Tabs>
        <SalonFilter
          salons={salons}
          value={search.salon}
          onChange={(salon) => void navigate({ search: (s) => ({ ...s, salon }), replace: true })}
        />
      </div>
      {shown.length === 0 ? (
        <EmptyState
          title={jobs.length === 0 ? "No jobs yet" : "Nothing here"}
          description={
            jobs.length === 0 ? "Post your first job: it goes live straight away." : undefined
          }
          action={
            jobs.length === 0 && (
              <Button asChild>
                <Link to="/employer/jobs/new" search={{ salon: search.salon }}>
                  Post a job
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent>
            <JobsTable jobs={shown} showSalon={salons.length > 1 && !search.salon} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
