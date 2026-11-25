import { AU_STATES } from "@salonstaff/shared";
import { CardTable } from "@salonstaff/ui/card-table";
import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
import { Badge } from "@salonstaff/ui/components/badge";
import { Input } from "@salonstaff/ui/components/input";
import { Label } from "@salonstaff/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@salonstaff/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { Textarea } from "@salonstaff/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { ActionDialog } from "@/components/action-dialog";
import { DetailList, EmptyList, FormError, PageHeader, Section } from "@/components/page";
import { api, errorMessage, unwrap } from "@/lib/api";
import { confirmWithPasskey } from "@/lib/confirm";
import { CLAIM_STATUSES, formatDate, formatMoney, humanize, PAYMENT_KINDS } from "@/lib/format";
import { can, meQuery, type SalonDetail, salonQuery } from "@/lib/queries";
import { AuditLog } from "./audit";
import { JobActions, JobStatus } from "./jobs";
import { AbnBadge } from "./salons";

const APP_URL = import.meta.env.VITE_APP_URL;
const VIA: Record<string, string> = {
  free_period: "Free period",
  subscription: "Salon Plan",
  credit: "Listing credits",
};

function entitlementText(d: SalonDetail): string {
  if (d.entitlement.ok) return `Can publish (${VIA[d.entitlement.via ?? ""] ?? d.entitlement.via})`;
  return d.entitlement.reason === "suspended"
    ? "Can't publish: not active"
    : "Needs a listing credit or the Salon Plan";
}

function Panel(props: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Section title={props.title} description={props.description}>
      <div className="flex flex-wrap gap-2 p-4">{props.children}</div>
    </Section>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-32"
      />
    </div>
  );
}

const DETAIL_FIELDS = [
  { key: "name", label: "Name" },
  { key: "address", label: "Street address" },
  { key: "suburb", label: "Suburb" },
  { key: "postcode", label: "Postcode" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Business email", hint: "Claim links for an unclaimed listing go here." },
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
] as const;
type DetailKey = (typeof DETAIL_FIELDS)[number]["key"] | "state" | "about";

/** The details a listing shows, as the edit form starts them. */
function detailsOf(d: SalonDetail): Record<DetailKey, string> {
  return {
    name: d.salon.name,
    address: d.address ?? "",
    suburb: d.salon.suburb,
    state: d.salon.state,
    postcode: d.salon.postcode,
    phone: d.phone ?? "",
    email: d.email ?? "",
    website: d.website ?? "",
    instagram: d.instagram ?? "",
    about: d.about ?? "",
  };
}

/**
 * Edits a salon's details, for fixing a directory listing (a wrong suburb, an old address).
 * Sends only what changed; a blank optional field clears it.
 */
function EditDetails({ d }: { d: SalonDetail }) {
  const [values, setValues] = useState(() => detailsOf(d));
  const set = (key: DetailKey, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const changed = () => {
    const before = detailsOf(d);
    return Object.fromEntries(
      Object.entries(values)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([key, value]) => value !== before[key as DetailKey]),
    );
  };
  return (
    <ActionDialog
      label="Edit details"
      title={`Edit ${d.salon.name}`}
      description={
        d.salon.owner
          ? "Its owner can change these in their settings too. A new name, suburb or state gives it a new web address; the old one redirects."
          : "A new name, suburb or state gives it a new web address; the old one redirects. Leave an optional field blank to clear it."
      }
      confirm="Save"
      run={async () =>
        unwrap(
          await api.PATCH("/admin/v1/salons/{id}", {
            params: { path: { id: d.salon.id } },
            body: changed(),
          }),
        )
      }
      done="Details saved"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {DETAIL_FIELDS.map((field) => (
          <div
            key={field.key}
            className={`flex flex-col gap-1.5 ${field.key === "name" || field.key === "address" ? "sm:col-span-2" : ""}`}
          >
            <Label htmlFor={`edit-${field.key}`}>{field.label}</Label>
            <Input
              id={`edit-${field.key}`}
              value={values[field.key]}
              onChange={(event) => set(field.key, event.target.value)}
            />
            {"hint" in field ? <p className="text-muted-foreground text-xs">{field.hint}</p> : null}
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-state">State</Label>
          <Select value={values.state} onValueChange={(value) => set("state", value)}>
            <SelectTrigger id="edit-state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AU_STATES.map((state) => (
                <SelectItem key={state.value} value={state.value}>
                  {state.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="edit-about">About</Label>
          <Textarea
            id="edit-about"
            value={values.about}
            onChange={(event) => set("about", event.target.value)}
            rows={3}
          />
        </div>
      </div>
    </ActionDialog>
  );
}

function Actions({ d }: { d: SalonDetail }) {
  const me = useQuery(meQuery).data;
  const navigate = useNavigate();
  const { salon } = d;
  const path = { params: { path: { id: salon.id } } };
  const [days, setDays] = useState("30");
  const [delta, setDelta] = useState("1");
  const moderate = can(me, "salons:moderate");
  const credits = can(me, "salons:credits");

  const setStatus = async (status: "active" | "suspended" | "removed", reason: string) => {
    const confirmation =
      status === "active"
        ? undefined
        : await confirmWithPasskey(
            status === "suspended" ? "salon.suspend" : "salon.remove",
            salon.id,
          );
    return unwrap(
      await api.POST("/admin/v1/salons/{id}/status", {
        ...path,
        body: { status, ...(reason ? { reason } : {}), ...(confirmation ? { confirmation } : {}) },
      }),
    );
  };

  return (
    <>
      {moderate ? (
        <Panel
          title="Details"
          description="Fix its name, place or contact details, for example a wrong suburb from an import."
        >
          <EditDetails key={`${salon.id}-${d.salon.path}`} d={d} />
        </Panel>
      ) : null}
      {moderate ? (
        <Panel
          title="Business status"
          description="Suspend: its jobs are hidden and it can't post. Remove: also gone from the directory. Both can be undone."
        >
          {salon.status === "active" ? (
            <>
              <ActionDialog
                label="Suspend"
                destructive
                title={`Suspend ${salon.name}`}
                description="Its jobs are hidden and it can't post. Asks for your passkey."
                reason={{ label: "Reason", placeholder: "Shown to the owner", required: true }}
                run={(reason) => setStatus("suspended", reason)}
                done="Salon suspended"
              />
              <ActionDialog
                label="Remove from site"
                destructive
                title={`Remove ${salon.name} from the site`}
                description="As suspended, and gone from the directory. Asks for your passkey."
                reason={{ label: "Reason", placeholder: "Shown to the owner", required: true }}
                run={(reason) => setStatus("removed", reason)}
                done="Salon removed"
              />
            </>
          ) : (
            <ActionDialog
              label="Reinstate"
              variant="default"
              title={`Reinstate ${salon.name}`}
              description="Its jobs show again and it can post."
              run={() => setStatus("active", "")}
              done="Salon reinstated"
            />
          )}
          {salon.owner ? (
            <ActionDialog
              label="Detach owner"
              title="Detach the owner"
              description="It becomes an unclaimed directory listing anyone can claim. The owner's account stays."
              run={async () => unwrap(await api.POST("/admin/v1/salons/{id}/unclaim", path))}
              done="Owner detached"
            />
          ) : null}
        </Panel>
      ) : null}

      {moderate && salon.abn ? (
        <Panel
          title="ABN"
          description={
            <a
              href={`https://abr.business.gov.au/ABN/View?abn=${salon.abn}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Look it up on the ABR
            </a>
          }
        >
          <ActionDialog
            label="Verified"
            title="Mark the ABN verified"
            description="It's active on the ABR and the business matches."
            run={async () =>
              unwrap(
                await api.POST("/admin/v1/salons/{id}/abn", {
                  ...path,
                  body: { status: "verified" },
                }),
              )
            }
            done="ABN verified"
          />
          <ActionDialog
            label="Failed"
            destructive
            title="Mark the ABN failed"
            description="It isn't active, or it's another business's."
            run={async () =>
              unwrap(
                await api.POST("/admin/v1/salons/{id}/abn", {
                  ...path,
                  body: { status: "failed" },
                }),
              )
            }
            done="ABN marked failed"
          />
        </Panel>
      ) : null}

      {credits ? (
        <>
          <Panel
            title="Free listing period"
            description={d.free_until ? `Free until ${formatDate(d.free_until)}` : "No free period"}
          >
            <ActionDialog
              label="Extend"
              title="Extend the free period"
              description="From its current end, or from today if it has ended."
              confirm="Extend"
              run={async () =>
                unwrap(
                  await api.POST("/admin/v1/salons/{id}/free-period", {
                    ...path,
                    body: { days: Number(days) },
                  }),
                )
              }
              done="Free period extended"
            >
              <NumberField
                id="free-days"
                label="Days"
                value={days}
                onChange={setDays}
                min={1}
                max={365}
              />
            </ActionDialog>
            <ActionDialog
              label="End now"
              title="End the free period now"
              description="From now on a job needs a listing credit or the Salon Plan."
              run={async () =>
                unwrap(
                  await api.POST("/admin/v1/salons/{id}/free-period", {
                    ...path,
                    body: { end: true },
                  }),
                )
              }
              done="Free period ended"
            />
          </Panel>
          <Panel
            title="Listing credits"
            description={`${d.listing_credits} left. Give free listings, or take them away with a negative number.`}
          >
            <ActionDialog
              label="Adjust credits"
              title="Adjust listing credits"
              confirm="Adjust"
              reason={{
                label: "Reason",
                placeholder: "e.g. goodwill after an outage",
                required: true,
                hint: "Recorded in the audit log.",
              }}
              run={async (reason) =>
                unwrap(
                  await api.POST("/admin/v1/salons/{id}/credits", {
                    ...path,
                    body: { delta: Number(delta), reason },
                  }),
                )
              }
              done="Credits adjusted"
            >
              <NumberField
                id="credit-delta"
                label="Credits (−100 to 100)"
                value={delta}
                onChange={setDelta}
                min={-100}
                max={100}
              />
            </ActionDialog>
          </Panel>
          <Panel
            title="Founding salon"
            description="Founding salons pay the lower Salon Plan price for life."
          >
            <ActionDialog
              label={d.founding ? "Remove founding price" : "Give founding price"}
              title={d.founding ? "Remove the founding price" : "Give the founding price"}
              run={async () =>
                unwrap(
                  await api.POST("/admin/v1/salons/{id}/founding", {
                    ...path,
                    body: { founding: !d.founding },
                  }),
                )
              }
              done={d.founding ? "Founding price removed" : "Founding price given"}
            />
          </Panel>
        </>
      ) : null}

      {can(me, "salons:delete") ? (
        <Panel
          title="Delete"
          description="Permanently deletes the salon, its jobs, applications, payments and claims. The owner's account stays."
        >
          <ActionDialog
            label="Delete permanently"
            destructive
            title={`Delete ${salon.name} permanently`}
            description="This can't be undone. Asks for your passkey."
            reason={{ label: "Reason (optional)", required: false }}
            run={async (reason) => {
              const confirmation = await confirmWithPasskey("salon.delete", salon.id);
              return unwrap(
                await api.DELETE("/admin/v1/salons/{id}", {
                  ...path,
                  body: { ...(reason ? { reason } : {}), confirmation },
                }),
              );
            }}
            done="Salon deleted"
            onDone={() => navigate({ to: "/salons" })}
          />
        </Panel>
      ) : null}
    </>
  );
}

export function SalonPage() {
  const { salonId } = useParams({ from: "/salons/$salonId" });
  const me = useQuery(meQuery).data;
  const detail = useQuery(salonQuery(salonId));
  const d = detail.data;
  if (detail.isError) return <FormError message={errorMessage(detail.error)} />;
  if (!d) return null;
  const { salon, owner } = d;

  return (
    <>
      <p className="text-sm">
        <Link to="/salons" className="text-muted-foreground hover:underline">
          ← Salons
        </Link>
      </p>
      <PageHeader
        title={salon.name}
        description={`${salon.suburb}, ${salon.state} ${salon.postcode} · added ${formatDate(salon.created_at)}`}
      >
        {salon.source === "directory" ? <Badge variant="outline">Directory listing</Badge> : null}
        {d.founding ? <Badge variant="secondary">Founding</Badge> : null}
      </PageHeader>
      {salon.status !== "active" ? (
        <Alert variant="destructive">
          <AlertTitle>This business is {salon.status}</AlertTitle>
          <AlertDescription>
            {salon.status_reason ? `${salon.status_reason}. ` : ""}Its jobs are hidden
            {salon.status === "removed" ? " and it isn't in the directory" : ""}.
          </AlertDescription>
        </Alert>
      ) : null}
      {owner?.banned_at ? (
        <Alert variant="destructive">
          <AlertTitle>The owner is banned, so this salon's jobs are hidden</AlertTitle>
          <AlertDescription>
            <Link to="/users/$userId" params={{ userId: owner.id }} className="underline">
              Manage the owner
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {!owner ? (
        <Alert>
          <AlertDescription>
            Unclaimed directory listing
            {d.email
              ? `: claim links go to ${d.email}.`
              : " with no business email, so claims come to the Claims queue."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Details">
            <DetailList
              items={[
                [
                  "Owner",
                  owner ? (
                    <Link
                      key="owner"
                      to="/users/$userId"
                      params={{ userId: owner.id }}
                      className="underline underline-offset-4"
                    >
                      {owner.email ?? owner.phone ?? owner.name}
                    </Link>
                  ) : (
                    "Unclaimed"
                  ),
                ],
                [
                  "Source",
                  salon.source === "directory"
                    ? `Directory listing${salon.claimed_at ? `, claimed ${formatDate(salon.claimed_at)}` : ""}`
                    : "Made by its owner",
                ],
                ["Contact", [d.contact_name, d.phone].filter(Boolean).join(" · ")],
                ["Business email", d.email],
                ["Address", d.address],
                ["Website", d.website],
                ["Instagram", d.instagram ? `@${d.instagram}` : null],
                ["ABN", <AbnBadge key="abn" salon={salon} />],
                ["Registered name", d.abn_entity_name],
                [
                  "Public page",
                  <a
                    key="page"
                    href={`${APP_URL}${salon.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    {salon.path}
                  </a>,
                ],
                ["Publishing", entitlementText(d)],
                ["Free until", formatDate(d.free_until)],
                ["Listing credits", d.listing_credits],
                [
                  "Salon Plan",
                  d.subscription.active
                    ? `Active, renews ${formatDate(d.subscription.current_period_end)}`
                    : humanize(d.subscription.status ?? "none"),
                ],
              ]}
            />
          </Section>

          <Section title={`Jobs (${d.jobs.length})`}>
            <CardTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applicants</TableHead>
                    <TableHead>Paid via</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <a
                          href={`${APP_URL}${job.path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium"
                        >
                          {job.title}
                        </a>
                        <div className="text-xs text-muted-foreground">
                          {job.status === "live"
                            ? `Until ${formatDate(job.expires_at)}`
                            : `Made ${formatDate(job.created_at)}`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <JobStatus job={job} />
                      </TableCell>
                      <TableCell className="tabular-nums">{job.applicants}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {humanize(job.paid_via)}
                      </TableCell>
                      <TableCell className="text-right">
                        {can(me, "jobs:moderate") ? <JobActions job={job} /> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardTable>
            {d.jobs.length === 0 ? <EmptyList>No jobs.</EmptyList> : null}
          </Section>

          {d.claims.length > 0 ? (
            <Section title="Claims">
              <CardTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>By</TableHead>
                      <TableHead>ABN</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.claims.map((claim) => (
                      <TableRow key={claim.id}>
                        <TableCell>
                          <Link to="/users/$userId" params={{ userId: claim.claimant.id }}>
                            {claim.contact_name}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {claim.claimant.email}
                          </div>
                        </TableCell>
                        <TableCell>{claim.abn}</TableCell>
                        <TableCell>{CLAIM_STATUSES[claim.status] ?? claim.status}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(claim.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardTable>
            </Section>
          ) : null}

          {d.payments.length > 0 ? (
            <Section title="Payments">
              <CardTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{PAYMENT_KINDS[payment.kind] ?? payment.kind}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatMoney(payment.amount_cents)}
                        </TableCell>
                        <TableCell>{humanize(payment.status)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(payment.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardTable>
            </Section>
          ) : null}

          <Section title="History">
            <div className="flex flex-col gap-3 p-4">
              <AuditLog target={salon.id} days={365} />
            </div>
          </Section>
        </div>
        <aside className="flex flex-col gap-5">
          <Actions d={d} />
        </aside>
      </div>
    </>
  );
}
