import { BRAND, PRICING } from "@salonstaff/shared";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppLink } from "@/components/app-link";
import { readSalonForm, SalonFields } from "@/components/employer";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { Notice, PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe, safeNext } from "@/lib/session";

export const Route = createFileRoute("/employer/onboarding")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search.next),
  }),
  head: () => privatePage("Add a salon"),
  component: Onboarding,
});

/** The API's 409 names the listing to claim when the ABN is already in the directory. */
const claimPathIn = (hint: string | undefined) =>
  hint?.match(/(\/salons\/[a-z0-9/-]+\/claim)\b/)?.[1];

function Onboarding() {
  const { me } = Route.useRouteContext();
  const { next } = Route.useSearch();
  const action = useAction();
  const navigate = useNavigate();
  const router = useRouter();
  const claimPath = action.problem?.status === 409 ? claimPathIn(action.problem.hint) : undefined;
  const first = me.salons.length === 0;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={first ? "Add your salon" : "Add another salon"}
        description={
          first
            ? `List jobs free for your first ${PRICING.freePeriodDays} days. The first ${PRICING.foundingSalonLimit} salons keep founding pricing.`
            : "Each location is its own salon, with its own jobs and page. You'll be its owner."
        }
      />
      {next && (
        <Notice title="Then back to where you were">
          Once your salon is added, we'll take you straight back so you can get in touch.
        </Notice>
      )}
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={action.submit(async (form) => {
              const body = readSalonForm(form);
              const salon = unwrap(await api.POST("/v1/employer/salons", { body }));
              forgetMe();
              toast.success(`${salon.name} is set up`);
              // Back where they were (a job seeker's profile they wanted to contact), or the salon.
              if (next) await navigate({ href: next });
              else await navigate({ to: "/employer/$salonId", params: { salonId: salon.id } });
              await router.invalidate();
            })}
          >
            <SalonFields
              salon={{ contactName: me.name, phone: me.phoneNumber }}
              errors={action.errors}
            />
            <FormMessage message={action.message}>
              {claimPath && (
                <>
                  {" "}
                  <AppLink href={claimPath} className="font-medium underline">
                    Claim your listing
                  </AppLink>
                </>
              )}
            </FormMessage>
            <SubmitButton pending={action.pending}>
              {first ? "Create my salon" : "Add this salon"}
            </SubmitButton>
            <p className="text-muted-foreground text-xs">
              Already in the {BRAND.name} directory?{" "}
              <AppLink href="/salons" className="underline">
                Find your salon
              </AppLink>{" "}
              and claim it instead.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
