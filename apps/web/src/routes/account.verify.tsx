/**
 * Verification (D-03): an identity check (Stripe Identity, or the local mock page, at the URL
 * the API returns), right to work, and qualification certificates. Only the verification IDs
 * are kept once decided.
 */
import { rightToWorkSchema } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useMyProfile } from "@/components/account-profile";
import { AppLink } from "@/components/app-link";
import {
  FormMessage,
  formText,
  parse,
  SelectField,
  SubmitButton,
  TextField,
  useAction,
} from "@/components/form";
import { Notice, PageHeader } from "@/components/page";
import { VerificationList } from "@/components/profile-view";
import { QualificationItem } from "@/components/qualification-check";
import { api, type Schemas, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

type Checks = Schemas["Checks"];
type Status = Schemas["Verification"]["identity"];

export const Route = createFileRoute("/account/verify")({
  loader: async () => unwrap(await api.GET("/v1/me/checks")),
  head: () => privatePage("Verification"),
  component: Verify,
});

const STATUS: Record<Status, string> = {
  not_started: "Not started",
  pending: "In review",
  requires_input: "Needs another try",
  verified: "Verified",
  failed: "Not verified",
  expired: "Verify again",
};

function StatusBadge({ status }: { status: Status }) {
  return <Badge variant={status === "verified" ? "default" : "outline"}>{STATUS[status]}</Badge>;
}

function Verify() {
  const checks = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const v = checks.verification;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Verification"
        description="Checks salons can trust. We keep only the outcome and a verification ID, never copies of your documents."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Identity status={v.identity} hasProfile={me.profile !== null} />
          <RightToWork status={v.rightToWork} />
          <Qualifications status={v.qualification} />
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your verification IDs</CardTitle>
              <CardDescription>Salons see these on your applications.</CardDescription>
            </CardHeader>
            <CardContent>
              <VerificationList verification={v} />
            </CardContent>
          </Card>
          <History checks={checks.checks} />
        </aside>
      </div>
    </div>
  );
}

function CheckCard({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: Status;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title} <StatusBadge status={status} />
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Identity({ status, hasProfile }: { status: Status; hasProfile: boolean }) {
  const action = useAction();
  return (
    <CheckCard
      title="Identity"
      description="A photo of your government ID and a live selfie, checked by our verification provider. The name on your ID is compared with your profile."
      status={status}
    >
      {status === "verified" ? (
        <p className="text-sm">Your identity is verified.</p>
      ) : !hasProfile ? (
        <Notice>
          Save your profile first:{" "}
          <AppLink href="/account" className="underline">
            your basics
          </AppLink>
          .
        </Notice>
      ) : status === "pending" ? (
        <p className="text-sm">We're waiting for the result. Check back in a few minutes.</p>
      ) : (
        <div className="space-y-3">
          {(status === "failed" || status === "requires_input") && (
            <p className="text-sm">The last check didn't go through. You can try again.</p>
          )}
          {status === "expired" && (
            <p className="text-sm">
              Your name changed after your ID was checked, so verify it again with the ID in your
              new name.
            </p>
          )}
          <FormMessage message={action.message} />
          <Button
            disabled={action.pending}
            onClick={() =>
              action.run(async () => {
                const { url } = unwrap(
                  await api.POST("/v1/me/checks/identity", {
                    body: { returnUrl: `${window.location.origin}/account/verify` },
                  }),
                );
                window.location.href = url;
              })
            }
          >
            Verify my identity
          </Button>
        </div>
      )}
    </CheckCard>
  );
}

function RightToWork({ status }: { status: Status }) {
  const router = useRouter();
  const action = useAction();
  const [basis, setBasis] = useState("citizen");
  return (
    <CheckCard
      title="Right to work"
      description="Salons see the outcome, never your visa details. Visa details are deleted once we've checked them."
      status={status}
    >
      {status === "verified" ? (
        <p className="text-sm">Your right to work is checked.</p>
      ) : status === "pending" ? (
        <p className="text-sm">We're checking it. You'll get an email when it's done.</p>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={action.submit(async (form) => {
            const body = parse(rightToWorkSchema, formText(form));
            unwrap(await api.POST("/v1/me/checks/right-to-work", { body }));
            toast.success("Sent for checking");
            await router.invalidate();
          })}
        >
          <SelectField
            label="I can work in Australia as"
            name="basis"
            value={basis}
            onChange={(event) => setBasis(event.target.value)}
            options={[
              { value: "citizen", label: "An Australian or NZ citizen" },
              { value: "permanent_resident", label: "A permanent resident" },
              { value: "visa", label: "A visa holder" },
            ]}
            error={action.errors.basis}
          />
          {basis === "visa" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Visa grant number"
                name="visaGrantNumber"
                required
                error={action.errors.visaGrantNumber}
              />
              <TextField
                label="Passport country"
                name="passportCountry"
                error={action.errors.passportCountry}
              />
            </div>
          )}
          <FormMessage message={action.message} />
          <div>
            <SubmitButton pending={action.pending}>Send for checking</SubmitButton>
          </div>
        </form>
      )}
    </CheckCard>
  );
}

/** The same qualifications as the profile's education section, each verified on its own. */
function Qualifications({ status }: { status: Status }) {
  const full = useMyProfile();
  const education = full?.education ?? [];
  return (
    <CheckCard
      title="Qualifications"
      description="Verify each qualification on your profile with its certificate. Verified ones get a tick on your profile, and salons see the verification ID."
      status={status}
    >
      <div className="space-y-3">
        {education.length > 0 ? (
          <ul className="divide-y">
            {education.map((item) => (
              <QualificationItem key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No qualifications on your profile yet.</p>
        )}
        {full && (
          <Link to="/account/experience" className="text-sm underline">
            Add a qualification
          </Link>
        )}
      </div>
    </CheckCard>
  );
}

const KIND = {
  identity: "Identity",
  right_to_work: "Right to work",
  qualification: "Qualification",
};

function History({ checks }: { checks: Checks["checks"] }) {
  if (checks.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {checks.map((check) => (
            <li key={check.id} className="flex justify-between gap-3">
              <span>
                {KIND[check.kind]}
                {check.title && `: ${check.title}`}
                <span className="block text-muted-foreground text-xs">
                  {formatDate(check.createdAt)}
                </span>
              </span>
              <span className="text-right">
                {STATUS[check.status]}
                {check.reference && (
                  <span className="block font-mono text-muted-foreground text-xs">
                    {check.reference}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
