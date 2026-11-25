/**
 * Claiming a directory listing (D-04): the ABN must match, then a link to the listing's own
 * email, or a staff check.
 */
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { Label } from "@salonstaff/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@salonstaff/ui/components/radio-group";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Me } from "@/lib/session";
import { AppLink } from "./app-link";
import { FormMessage, formText, SubmitButton, TextField, useAction } from "./form";
import { Breadcrumbs } from "./listing";
import { Notice, Page, PageHeader } from "./page";
import type { SalonPage } from "./salons-pages";

type Claim = Schemas["Claim"];

export function ClaimView({
  page,
  me,
  claim,
}: {
  page: SalonPage;
  me: Me | null;
  claim: Claim | null;
}) {
  const { salon } = page;
  const claimPath = `${salon.path}/claim`;
  const mine = me?.salons.find((s) => s.id === salon.id);
  return (
    <Page width="narrow">
      <Breadcrumbs crumbs={[...page.breadcrumbs, { name: "Claim", path: claimPath }]} />
      <PageHeader
        title={`Claim ${salon.name}`}
        description="Manage this listing and post jobs. First we check you run the business."
      />
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
      ) : claim && claim.status !== "rejected" ? (
        <ClaimStatus claim={claim} />
      ) : (
        <>
          {!page.claimable && (
            <Notice title="This listing already has an owner">
              If you've taken over the business, you can still claim it with the same checks. If
              your claim is approved you become one of its owners, and we email the others. To join
              its team instead, ask an owner to invite you.
            </Notice>
          )}
          {claim?.status === "rejected" && (
            <Notice title="Your last claim wasn't approved" tone="destructive">
              {claim.decisionNote ?? "Check the details and try again."}
            </Notice>
          )}
          <StartClaim salonId={salon.id} />
        </>
      )}
    </Page>
  );
}

function ClaimStatus({ claim }: { claim: Claim }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function askForReview() {
    setPending(true);
    try {
      unwrap(await api.POST("/v1/claims/{id}/review", { params: { path: { id: claim.id } } }));
      toast.success("We'll check your claim and email you.");
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  if (claim.status === "approved") {
    return (
      <Notice title="Your claim was approved">
        The listing is yours.{" "}
        <AppLink href={`/employer/${claim.salonId}`} className="underline">
          Go to your dashboard
        </AppLink>
      </Notice>
    );
  }
  if (claim.status === "pending_email") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check the business's email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            We sent a link to {claim.sentTo ?? "the listing's email address"} on{" "}
            {formatDate(claim.createdAt)}. Open it while signed in as you to finish the claim.
          </p>
          <p className="text-muted-foreground">Can't get to that inbox?</p>
          <Button variant="outline" onClick={askForReview} disabled={pending}>
            Ask Salon Staff to check instead
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Notice title="We're checking your claim">
      Salon Staff is reviewing it. We'll email you once it's decided.
    </Notice>
  );
}

function StartClaim({ salonId }: { salonId: string }) {
  const router = useRouter();
  const action = useAction();
  const [method, setMethod] = useState<"email" | "review">("email");
  return (
    <Card>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={action.submit(async (form) => {
            const values = formText(form);
            unwrap(
              await api.POST("/v1/salons/{id}/claims", {
                params: { path: { id: salonId } },
                body: {
                  abn: values.abn ?? "",
                  contactName: values.contactName ?? "",
                  phone: values.phone ?? "",
                  method,
                },
              }),
            );
            await router.invalidate();
          })}
        >
          <TextField
            label="ABN"
            name="abn"
            inputMode="numeric"
            required
            hint="It must match the business's ABN."
            error={action.errors.abn}
          />
          <TextField
            label="Your name"
            name="contactName"
            required
            autoComplete="name"
            error={action.errors.contactName}
          />
          <TextField
            label="Your phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            error={action.errors.phone}
          />
          <fieldset className="space-y-2">
            <legend className="mb-1.5 font-medium text-sm">How should we check?</legend>
            <RadioGroup value={method} onValueChange={(value) => setMethod(value as typeof method)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="email" id="claim-email" />
                <Label htmlFor="claim-email" className="font-normal">
                  Email a link to the business's listed address (fastest)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="review" id="claim-review" />
                <Label htmlFor="claim-review" className="font-normal">
                  Have Salon Staff check it
                </Label>
              </div>
            </RadioGroup>
          </fieldset>
          <FormMessage message={action.message} />
          <SubmitButton pending={action.pending}>Claim this business</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
