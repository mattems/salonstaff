import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";
import { AppLink } from "@/components/app-link";
import {
  EntitlementSummary,
  JobFields,
  NotifyFields,
  readJobForm,
  readNotify,
  SalonStatusBanner,
} from "@/components/employer";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/employer/$salonId/jobs/new")({
  loader: async ({ context, params }) => {
    const team = await api.GET("/v1/employer/salons/{salonId}/team", {
      params: { path: { salonId: params.salonId } },
    });
    return { salon: context.salon, team: unwrap(team).members };
  },
  head: () => privatePage("Post a job"),
  component: NewJob,
});

function NewJob() {
  const { salon, team } = Route.useLoaderData();
  const salonId = salon.id;
  const navigate = useNavigate();
  const action = useAction();
  /** Which button sent the form. */
  const publish = useRef(true);
  const needsListing = action.problem?.code === "listing_needed";
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Post a job"
        description={
          <EntitlementSummary
            salonId={salonId}
            entitlement={salon.entitlement}
            freeUntil={salon.freeUntil}
            listingCredits={salon.listingCredits}
          />
        }
      />
      <SalonStatusBanner salon={salon} />
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={action.submit(async (form) => {
              const body = {
                ...readJobForm(form),
                notifyUserIds: readNotify(form),
                publish: publish.current,
              };
              const job = unwrap(
                await api.POST("/v1/employer/salons/{salonId}/jobs", {
                  params: { path: { salonId } },
                  body,
                }),
              );
              toast.success(job.status === "published" ? "Your job is live" : "Draft saved");
              await navigate({
                to: "/employer/$salonId/jobs/$id",
                params: { salonId, id: job.id },
              });
            })}
          >
            <JobFields salon={salon} errors={action.errors} />
            <NotifyFields team={team} />
            <FormMessage message={action.message}>
              {needsListing && (
                <>
                  {" "}
                  <AppLink href={`/employer/${salonId}/billing`} className="font-medium underline">
                    Buy a listing
                  </AppLink>
                  , or save a draft for now.
                </>
              )}
            </FormMessage>
            <div className="flex flex-wrap gap-2">
              <SubmitButton
                pending={action.pending}
                disabled={!salon.entitlement.ok}
                onClick={() => {
                  publish.current = true;
                }}
              >
                Publish now
              </SubmitButton>
              <Button
                type="submit"
                variant="outline"
                disabled={action.pending}
                onClick={() => {
                  publish.current = false;
                }}
              >
                Save as draft
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
