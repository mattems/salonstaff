/**
 * A listing's claim page (`{salon page}/claim`, D-04, D-22): the claim itself is `ClaimFlow`,
 * as in the add-a-salon wizard.
 */
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent } from "@salonstaff/ui/components/card";
import { useNavigate } from "@tanstack/react-router";
import type { Me } from "@/lib/session";
import { AppLink } from "./app-link";
import { ClaimFlow } from "./claim-flow";
import { Breadcrumbs } from "./listing";
import { Notice, Page, PageHeader } from "./page";
import { SalonLogo } from "./salon-brand";
import type { SalonPage } from "./salons-pages";

export function ClaimView({ page, me }: { page: SalonPage; me: Me | null }) {
  const { salon } = page;
  const navigate = useNavigate();
  const claimPath = `${salon.path}/claim`;
  const mine = me?.salons.find((s) => s.id === salon.id);
  return (
    <Page width="narrow">
      <Breadcrumbs crumbs={[...page.breadcrumbs, { name: "Claim", path: claimPath }]} />
      <PageHeader
        title={`Claim ${salon.name}`}
        description="Manage this listing and post jobs. First we check you run the business."
      />
      <div className="mb-6 flex items-center gap-3">
        <SalonLogo name={salon.name} logoUrl={salon.logoUrl} />
        <div>
          <p className="font-medium">{salon.name}</p>
          <p className="text-muted-foreground text-sm">
            {salon.suburb} {salon.state} {salon.postcode}
          </p>
        </div>
      </div>
      {mine?.role === "owner" ? (
        <Notice title="You already own this salon">
          <AppLink href={`/employer/${salon.id}`} className="underline">
            Go to its dashboard
          </AppLink>
        </Notice>
      ) : !me ? (
        <Card>
          <CardContent className="space-y-3">
            <p>Sign in or create an account to claim this listing.</p>
            <Button asChild>
              <AppLink href={`/sign-in?as=employer&next=${encodeURIComponent(claimPath)}`}>
                Sign in to claim
              </AppLink>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <ClaimFlow
              salonId={salon.id}
              salonName={salon.name}
              me={me}
              onClaimed={(claimed) =>
                void navigate({
                  to: "/employer/onboarding",
                  search: { claimed: claimed.id },
                })
              }
            />
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
