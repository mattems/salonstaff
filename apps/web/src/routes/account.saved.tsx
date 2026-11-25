import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { JobCard } from "@/components/listing";
import { EmptyState, PageHeader } from "@/components/page";
import { api, errorMessage, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/saved")({
  loader: async () => unwrap(await api.GET("/v1/me/saved")),
  head: () => privatePage("Saved jobs"),
  component: Saved,
});

function Saved() {
  const { items } = Route.useLoaderData();
  const router = useRouter();
  async function unsave(id: string) {
    try {
      unwrap(await api.DELETE("/v1/jobs/{id}/save", { params: { path: { id } } }));
      toast.success("Removed from saved jobs");
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Saved jobs" description="Jobs you've kept for later." />
      {items.length === 0 ? (
        <EmptyState
          title="No saved jobs"
          description="Save a job from its page to come back to it."
          action={
            <Button asChild>
              <Link to="/jobs" search={{}}>
                Find jobs
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {items.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              action={
                <Button size="sm" variant="outline" onClick={() => unsave(job.id)}>
                  Remove
                </Button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
