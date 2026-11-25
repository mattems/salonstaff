import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { FormMessage, useAction } from "@/components/form";
import { Notice, Page } from "@/components/page";
import { api, type Schemas, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe, requireSignedIn } from "@/lib/session";

interface VerifySearch {
  token?: string | undefined;
}

/** The link in a claim email (D-04). It works only for the account that started the claim. */
export const Route = createFileRoute("/claim/verify")({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    token: typeof search.token === "string" ? search.token.slice(0, 200) : undefined,
  }),
  beforeLoad: ({ context, location }) => ({
    me: requireSignedIn(context.me, location.href, "employer"),
  }),
  head: () => privatePage("Confirm your claim"),
  component: ConfirmClaim,
});

function ConfirmClaim() {
  const { token } = Route.useSearch();
  const { me } = Route.useRouteContext();
  const router = useRouter();
  const action = useAction();
  const [done, setDone] = useState<Schemas["ClaimConfirmed"] | null>(null);
  return (
    <Page width="narrow">
      <Card>
        <CardHeader>
          <CardTitle>Confirm you manage this business</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <Notice tone="destructive">
              This link is missing its code. Open the link from the email again.
            </Notice>
          ) : done ? (
            <>
              <Notice title={`${done.salon.name} is yours`}>
                You can post jobs now, free during your launch period.
              </Notice>
              <Button asChild>
                <Link to="/employer/$salonId" params={{ salonId: done.salon.id }}>
                  Go to your dashboard
                </Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm">
                You're signed in as {me.email ?? me.phoneNumber}. Confirm to finish claiming the
                listing. This must be the account that started the claim.
              </p>
              <FormMessage message={action.message} />
              <Button
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    const result = unwrap(
                      await api.POST("/v1/claims/verify/{token}", { params: { path: { token } } }),
                    );
                    setDone(result);
                    forgetMe();
                    await router.invalidate();
                  })
                }
              >
                Confirm and manage the listing
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
