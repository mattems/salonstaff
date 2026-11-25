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
import { Input } from "@salonstaff/ui/components/input";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppLink } from "@/components/app-link";
import {
  FormError,
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
import { api, multipart, type Schemas, unwrap } from "@/lib/api";
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
          <Qualification status={v.qualification} title={v.qualificationTitle} />
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

function Qualification({ status, title }: { status: Status; title: string | null }) {
  const router = useRouter();
  const action = useAction();
  return (
    <CheckCard
      title="Qualification"
      description="Upload your certificate (PDF or a photo, up to 8MB). It's kept privately until we've reviewed it, then deleted."
      status={status}
    >
      {status === "pending" ? (
        <p className="text-sm">We're reviewing {title ?? "your certificate"}.</p>
      ) : (
        <div className="space-y-3">
          {status === "verified" && (
            <p className="text-sm">
              {title ?? "Your qualification"} is verified. You can add another.
            </p>
          )}
          <form
            className="grid gap-3"
            onSubmit={action.submit(
              async (form) => {
                const file = form.get("file");
                if (!(file instanceof File) || file.size === 0)
                  throw new FormError("Choose your certificate first");
                if (!String(form.get("title") ?? "").trim())
                  throw new FormError("Enter the qualification's name");
                unwrap(await api.POST("/v1/me/checks/qualification", multipart(form)));
                toast.success("Certificate sent for review");
                await router.invalidate();
              },
              { reset: true },
            )}
          >
            <TextField
              label="Qualification"
              name="title"
              placeholder="Cert III in Hairdressing"
              maxLength={120}
              error={action.errors.title}
            />
            <Input
              type="file"
              name="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              aria-label="Certificate"
            />
            <FormMessage message={action.message} />
            <div>
              <SubmitButton pending={action.pending}>Send for review</SubmitButton>
            </div>
          </form>
        </div>
      )}
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
