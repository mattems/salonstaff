import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { Label } from "@salonstaff/ui/components/label";
import { cn } from "@salonstaff/ui/lib/utils";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { toast } from "sonner";
import {
  EntitlementSummary,
  JobFields,
  NotifyFields,
  readJobForm,
  readNotify,
  SalonStatusBanner,
} from "@/components/employer";
import { FormMessage, SubmitButton, selectClass, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

/**
 * Post a job (D-20): you choose which of your salons it's for, then the job. `?salon=` picks the
 * salon; with only one, it's that one.
 */
export const Route = createFileRoute("/employer/jobs/new")({
  validateSearch: (search: Record<string, unknown>): { salon?: string | undefined } => ({
    salon: typeof search.salon === "string" ? search.salon : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    const { salons } = context;
    if (salons.length === 0) throw redirect({ to: "/employer/onboarding" });
    const open = salons.filter((s) => s.status === "active");
    // Only one it could be for: that one.
    if (!search.salon && open.length === 1) {
      throw redirect({ to: "/employer/jobs/new", search: { salon: open[0]?.id } });
    }
  },
  loaderDeps: ({ search }) => ({ salon: search.salon }),
  loader: async ({ deps }) => {
    if (!deps.salon) return null;
    const path = { salonId: deps.salon };
    const [salon, team] = await Promise.all([
      api.GET("/v1/employer/salons/{salonId}", { params: { path } }),
      api.GET("/v1/employer/salons/{salonId}/team", { params: { path } }),
    ]);
    if (salon.response.status === 404) return null;
    return { salon: unwrap(salon), team: unwrap(team).members };
  },
  head: () => privatePage("Post a job"),
  component: NewJob,
});

function NewJob() {
  const chosen = Route.useLoaderData();
  const { salons } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader
        title="Post a job"
        description={
          chosen ? (
            <EntitlementSummary
              salonId={chosen.salon.id}
              entitlement={chosen.salon.entitlement}
              freeUntil={chosen.salon.freeUntil}
              listingCredits={chosen.salon.listingCredits}
            />
          ) : (
            "Choose the salon it's for."
          )
        }
      />
      {salons.length > 1 && (
        <div className="grid gap-2">
          <Label htmlFor="salon">Salon</Label>
          <select
            id="salon"
            className={cn(selectClass)}
            value={chosen?.salon.id ?? ""}
            onChange={(e) =>
              void navigate({ search: { salon: e.target.value || undefined }, replace: true })
            }
          >
            <option value="" disabled>
              Choose a salon
            </option>
            {salons.map((salon) => (
              <option key={salon.id} value={salon.id} disabled={salon.status !== "active"}>
                {salon.name}
                {salon.status !== "active" ? ` (${salon.status})` : ""}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-sm">
            The ad shows this salon's name and page, and its team handles the applicants.
          </p>
        </div>
      )}
      {/* A new salon starts a new form, at that salon's address. */}
      {chosen && <JobForm key={chosen.salon.id} salon={chosen.salon} team={chosen.team} />}
    </div>
  );
}

function JobForm({
  salon,
  team,
}: {
  salon: NonNullable<ReturnType<typeof Route.useLoaderData>>["salon"];
  team: NonNullable<ReturnType<typeof Route.useLoaderData>>["team"];
}) {
  const salonId = salon.id;
  const navigate = useNavigate();
  const action = useAction();
  /** Which button sent the form. */
  const publish = useRef(true);
  const needsListing = action.problem?.code === "listing_needed";
  return (
    <>
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
              {needsListing && salon.role === "owner" && (
                <>
                  {" "}
                  <Link
                    to="/employer/$salonId/billing"
                    params={{ salonId }}
                    className="font-medium underline"
                  >
                    Buy a listing
                  </Link>
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
    </>
  );
}
