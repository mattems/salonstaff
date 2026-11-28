import { formatAbn } from "@salonstaff/shared";
import { Alert, AlertDescription } from "@salonstaff/ui/components/alert";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ActionDialog } from "@/components/action-dialog";
import {
  DetailList,
  EmptyList,
  FormError,
  PageHeader,
  Section,
  useCursors,
} from "@/components/page";
import { api, errorMessage, unwrap } from "@/lib/api";
import { confirmWithPasskey } from "@/lib/confirm";
import { CLAIM_STATUSES, formatDate } from "@/lib/format";
import { type Claim, claimsQuery } from "@/lib/queries";

const abrLink = (abn: string) =>
  `https://abr.business.gov.au/ABN/View?abn=${abn.replace(/\s+/g, "")}`;

function AbnGiven({ claim }: { claim: Claim }) {
  if (!claim.abn_given) {
    return <span className="text-muted-foreground">None given (proved by code)</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {formatAbn(claim.abn_given)}
      {claim.abn_matches === true ? <Badge variant="secondary">Matches the listing</Badge> : null}
      {claim.abn_matches === false ? (
        <Badge variant="destructive">Listing has {formatAbn(claim.listing_abn)}</Badge>
      ) : null}
      {claim.abn_matches === null ? <Badge variant="outline">Listing had no ABN</Badge> : null}
      <a
        href={abrLink(claim.abn_given)}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-4"
      >
        ABR
      </a>
    </span>
  );
}

function ClaimCard({ claim }: { claim: Claim }) {
  const open = claim.status === "pending_review" || claim.status === "pending_email";
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <CardTitle className="mr-auto text-base">
          <Link to="/salons/$salonId" params={{ salonId: claim.salon.id }}>
            {claim.salon.name}
          </Link>
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {claim.salon.suburb}, {claim.salon.state}
          </span>
        </CardTitle>
        <Badge
          variant={claim.status === "rejected" ? "destructive" : open ? "outline" : "secondary"}
        >
          {CLAIM_STATUSES[claim.status] ?? claim.status}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailList
          items={[
            [
              "Claimed by",
              <Link
                key="by"
                to="/users/$userId"
                params={{ userId: claim.claimant.id }}
                className="underline underline-offset-4"
              >
                {claim.claimant.name || claim.claimant.email || "Their account"}
              </Link>,
            ],
            ["Their contact", `${claim.contact_name} · ${claim.contact_phone}`],
            ["Account email", claim.claimant.email],
            ["ABN given", <AbnGiven key="abn" claim={claim} />],
            ["Registered name", claim.abr_name ?? "Not looked up"],
            ["Listing email", claim.salon.email],
            ["Listing phone", claim.salon.phone],
            [
              "Proof",
              claim.method === "email"
                ? "Code or link sent to the listing's email"
                : claim.method === "phone"
                  ? "Code texted to the listing's mobile"
                  : claim.method === "call"
                    ? "Code read out in a call to the listing's landline"
                    : "Staff review",
            ],
            ["Sent", formatDate(claim.created_at)],
            ...(claim.decision_note
              ? ([["Decision note", claim.decision_note]] as [string, string][])
              : []),
          ]}
        />
        {open ? (
          <div className="flex flex-wrap gap-2">
            <ActionDialog
              label="Approve"
              variant="default"
              title={`Approve the claim for ${claim.salon.name}`}
              description="They become the owner, with the launch free period. Other open claims on it are rejected."
              reason={{
                label: "How you confirmed it (optional)",
                placeholder: "Called the salon on its listed number",
                required: false,
              }}
              disabled={claim.salon.has_owner}
              run={async (note) => {
                const confirmation = await confirmWithPasskey("claim.approve", claim.id);
                return unwrap(
                  await api.POST("/admin/v1/claims/{id}/approve", {
                    params: { path: { id: claim.id } },
                    body: { ...(note ? { note } : {}), confirmation },
                  }),
                );
              }}
              done="Claim approved"
            />
            <ActionDialog
              label="Reject"
              destructive
              title={`Reject the claim for ${claim.salon.name}`}
              reason={{ label: "Why", placeholder: "Sent to them", required: true }}
              run={async (note) =>
                unwrap(
                  await api.POST("/admin/v1/claims/{id}/reject", {
                    params: { path: { id: claim.id } },
                    body: { note },
                  }),
                )
              }
              done="Claim rejected"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ClaimsPage() {
  const { show } = useSearch({ from: "/claims" });
  const navigate = useNavigate({ from: "/claims" });
  const status = show === "all" ? "all" : "open";
  const { cursor, reset, pager } = useCursors();
  const claims = useQuery(claimsQuery(status, cursor));
  const rows = claims.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Listing claims"
        description="Salon owners asking to manage a directory listing. Claims proven by the email link are approved automatically; the rest wait here."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            navigate({ search: status === "all" ? {} : { show: "all" } });
          }}
        >
          {status === "all" ? "Show open only" : "Show all"}
        </Button>
      </PageHeader>
      <Alert>
        <AlertDescription>
          An ABN is public, so before approving also confirm the person is genuine: call the salon
          on its listed number, or check their name on the ABR, the salon's website or Instagram.
        </AlertDescription>
      </Alert>
      <FormError message={claims.isError ? errorMessage(claims.error) : null} />
      {claims.isSuccess && rows.length === 0 ? (
        <Section>
          <EmptyList>{status === "open" ? "No open claims." : "No claims yet."}</EmptyList>
        </Section>
      ) : null}
      <div className="flex flex-col gap-4">
        {rows.map((claim) => (
          <ClaimCard key={claim.id} claim={claim} />
        ))}
      </div>
      {pager(claims.data?.next_cursor)}
    </>
  );
}
