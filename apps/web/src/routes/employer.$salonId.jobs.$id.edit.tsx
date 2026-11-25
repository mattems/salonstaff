import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { JobFields, NotifyFields, readJobForm, readNotify } from "@/components/employer";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/$salonId/jobs/$id/edit")({
  loader: async ({ params }) => {
    const path = { salonId: params.salonId, id: params.id };
    const [result, team] = await Promise.all([
      api.GET("/v1/employer/salons/{salonId}/jobs/{id}", { params: { path } }),
      api.GET("/v1/employer/salons/{salonId}/team", { params: { path } }),
    ]);
    if (result.response.status === 404) throw notFound();
    return { job: unwrap(result), team: unwrap(team).members };
  },
  head: () => privatePage("Edit job"),
  component: EditJob,
});

function EditJob() {
  const { job, team } = Route.useLoaderData();
  const { salonId } = Route.useParams();
  const navigate = useNavigate();
  const action = useAction();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Edit job"
        description="A new title or suburb gives a live ad a new address; the old one redirects."
      />
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={action.submit(async (form) => {
              const body = { ...readJobForm(form), notifyUserIds: readNotify(form) };
              unwrap(
                await api.PATCH("/v1/employer/salons/{salonId}/jobs/{id}", {
                  params: { path: { salonId, id: job.id } },
                  body,
                }),
              );
              toast.success("Saved");
              await navigate({
                to: "/employer/$salonId/jobs/$id",
                params: { salonId, id: job.id },
              });
            })}
          >
            <JobFields job={job} errors={action.errors} />
            <NotifyFields team={team} value={job.notifyUserIds} />
            <FormMessage message={action.message} />
            <SubmitButton pending={action.pending}>Save changes</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
