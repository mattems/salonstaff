import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { toast } from "sonner";
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
import { CHECK_KINDS, formatDate, humanize } from "@/lib/format";
import { type Check, checksQuery } from "@/lib/queries";

const LABELS: Record<string, string> = {
  basis: "Basis",
  visaGrantNumber: "Visa grant number",
  passportCountry: "Passport country",
  title: "Qualification",
  checkedVia: "Checked via",
};

const show = (value: unknown) =>
  typeof value === "string"
    ? humanize(value)
    : value === null || value === undefined
      ? "–"
      : String(value);

/** Fetches the certificate through the API (so it passes the staff gate) and opens it in a new tab. */
async function openDocument(check: Check) {
  const tab = window.open("", "_blank");
  try {
    const blob = unwrap(
      await api.GET("/admin/v1/checks/{id}/document", {
        params: { path: { id: check.id } },
        parseAs: "blob",
      }),
    ) as unknown as Blob;
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    toast.error(errorMessage(error));
  }
}

const decide = async (check: Check, decision: "verified" | "failed", note: string) =>
  unwrap(
    await api.POST("/admin/v1/checks/{id}/decision", {
      params: { path: { id: check.id } },
      body: { decision, ...(note ? { note } : {}) },
    }),
  );

function CheckCard({ check }: { check: Check }) {
  const open = check.status === "pending" || check.status === "requires_input";
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2">
        <Badge variant="secondary">{CHECK_KINDS[check.kind] ?? check.kind}</Badge>
        <CardTitle className="mr-auto text-base">
          <Link to="/users/$userId" params={{ userId: check.person.id }}>
            {check.person.name || check.person.email || "No name"}
          </Link>
        </CardTitle>
        <span className="text-sm text-muted-foreground">Sent {formatDate(check.submitted_at)}</span>
        {open ? null : (
          <Badge variant={check.status === "verified" ? "default" : "destructive"}>
            {humanize(check.status)}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DetailList
          items={[
            ["Email", check.person.email],
            ["Mobile", check.person.phone],
            ...Object.entries(check.details).map(
              ([key, value]) => [LABELS[key] ?? key, show(value)] as [string, string],
            ),
            ...(check.reference
              ? ([["Verification ID", check.reference]] as [string, string][])
              : []),
            ...(check.review_note ? ([["Note", check.review_note]] as [string, string][]) : []),
          ]}
        />
        {check.kind === "right_to_work" && open ? (
          <p className="text-sm text-muted-foreground">
            Citizens and permanent residents: nothing more to check. Visa holders: confirm their
            work conditions on the VEVO entitlement they sent before approving.
          </p>
        ) : null}
        {open ? (
          <div className="flex flex-wrap gap-2">
            {check.document_url ? (
              <Button variant="outline" size="sm" onClick={() => openDocument(check)}>
                <FileText />
                Open the document
              </Button>
            ) : null}
            <ActionDialog
              label="Approve"
              variant="default"
              title="Approve this check"
              description="It gets a verification ID that salons see. The evidence is deleted."
              reason={{ label: "Note (optional)", placeholder: "How you checked", required: false }}
              run={(note) => decide(check, "verified", note)}
              done="Check approved"
            />
            <ActionDialog
              label="Reject"
              destructive
              title="Reject this check"
              description="The evidence is deleted. They can send it again."
              reason={{ label: "Why", placeholder: "Told to the person", required: true }}
              run={(note) => decide(check, "failed", note)}
              done="Check rejected"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ChecksPage() {
  const { show: which } = useSearch({ from: "/checks" });
  const navigate = useNavigate({ from: "/checks" });
  const status = which === "all" ? "all" : "pending";
  const { cursor, reset, pager } = useCursors();
  const checks = useQuery(checksQuery(status, cursor));
  const rows = checks.data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Checks"
        description="Right-to-work and qualification checks waiting for a decision. ID checks are automatic (Stripe Identity)."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            navigate({ search: status === "all" ? {} : { show: "all" } });
          }}
        >
          {status === "all" ? "Show waiting only" : "Show all"}
        </Button>
      </PageHeader>
      <FormError message={checks.isError ? errorMessage(checks.error) : null} />
      {checks.isSuccess && rows.length === 0 ? (
        <Section>
          <EmptyList>{status === "pending" ? "All caught up." : "No checks yet."}</EmptyList>
        </Section>
      ) : null}
      <div className="flex flex-col gap-4">
        {rows.map((check) => (
          <CheckCard key={check.id} check={check} />
        ))}
      </div>
      {pager(checks.data?.next_cursor)}
    </>
  );
}
