import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { JobFields, readJobForm, requireOwnSalon } from "@/components/employer";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/jobs/$id/edit")({
  beforeLoad: ({ context }) => {
    requireOwnSalon(context.me);
  },
  loader: async ({ params }) => {
    const result = await api.GET("/v1/salon/jobs/{id}", { params: { path: { id: params.id } } });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: () => privatePage("Edit job"),
  component: EditJob,
});

function EditJob() {
  const job = Route.useLoaderData();
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
              const body = readJobForm(form);
              unwrap(
                await api.PATCH("/v1/salon/jobs/{id}", { params: { path: { id: job.id } }, body }),
              );
              toast.success("Saved");
              await navigate({ to: "/employer/jobs/$id", params: { id: job.id } });
            })}
          >
            <JobFields job={job} errors={action.errors} />
            <FormMessage message={action.message} />
            <SubmitButton pending={action.pending}>Save changes</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
