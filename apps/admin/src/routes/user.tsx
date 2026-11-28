import { labelFor, RIGHT_TO_WORK } from "@salonstaff/shared";
import { CardTable } from "@salonstaff/ui/card-table";
import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Label } from "@salonstaff/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@salonstaff/ui/components/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/components/action-dialog";
import { CopyButton } from "@/components/copy-button";
import { DetailList, EmptyList, FormError, PageHeader, Section } from "@/components/page";
import { api, errorMessage, unwrap } from "@/lib/api";
import { confirmWithPasskey } from "@/lib/confirm";
import { CHECK_KINDS, formatDate, formatRelative, humanize } from "@/lib/format";
import { can, meQuery, refreshAll, type UserDetail, userQuery } from "@/lib/queries";
import { AuditLog } from "./audit";

const APP_URL = import.meta.env.VITE_APP_URL;
type Role = "seeker" | "employer";
const ROLE_NAMES: Record<Role, string> = { seeker: "Job seeker", employer: "Employer" };

function Flags({ detail, canFlag }: { detail: UserDetail; canFlag: boolean }) {
  const resolve = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST("/admin/v1/flags/{id}/resolve", { params: { path: { id } } })),
    onSuccess: async () => {
      await refreshAll();
      toast.success("Flag resolved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Section
      title="Flags"
      description="Notes for the team (reported by a salon, a suspicious profile). A flag blocks nothing; a ban does."
      action={
        canFlag ? (
          <ActionDialog
            label="Add flag"
            title="Flag this person"
            reason={{
              label: "Reason",
              placeholder: "e.g. reported by a salon for no-shows",
              required: true,
            }}
            run={async (reason) =>
              unwrap(
                await api.POST("/admin/v1/users/{id}/flags", {
                  params: { path: { id: detail.user.id } },
                  body: { reason },
                }),
              )
            }
            done="Flag added"
          />
        ) : null
      }
    >
      {detail.flags.length === 0 ? (
        <EmptyList>No flags.</EmptyList>
      ) : (
        <ul className="divide-y">
          {detail.flags.map((flag) => (
            <li key={flag.id} className="flex items-start justify-between gap-3 p-4 text-sm">
              <div className={flag.resolved_at ? "text-muted-foreground" : undefined}>
                <p>{flag.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(flag.created_at)}
                  {flag.resolved_at ? ` · resolved ${formatDate(flag.resolved_at)}` : ""}
                </p>
              </div>
              {!flag.resolved_at && canFlag ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(flag.id)}
                >
                  Resolve
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Actions({ detail }: { detail: UserDetail }) {
  const me = useQuery(meQuery).data;
  const navigate = useNavigate();
  const { user } = detail;
  const [role, setRole] = useState<Role>(user.role);
  const userPath = { params: { path: { id: user.id } } };

  return (
    <Section title="Actions">
      <div className="flex flex-col gap-3 p-4">
        {can(me, "users:ban") ? (
          <>
            {user.banned_at ? (
              <ActionDialog
                label="Lift ban"
                variant="default"
                title="Lift the ban"
                description="They can sign in again."
                run={async () => unwrap(await api.POST("/admin/v1/users/{id}/unban", userPath))}
                done="Ban lifted"
              />
            ) : (
              <ActionDialog
                label="Ban account"
                destructive
                title="Ban this account"
                description="Signs them out everywhere and stops them signing in. Salons stop seeing their applications; an owner's jobs are hidden. Asks for your passkey."
                reason={{
                  label: "Reason",
                  placeholder: "e.g. fake profile, scam ads",
                  required: true,
                  hint: "Recorded in the audit log.",
                }}
                run={async (reason) => {
                  const confirmation = await confirmWithPasskey("user.ban", user.id);
                  return unwrap(
                    await api.POST("/admin/v1/users/{id}/ban", {
                      ...userPath,
                      body: { reason, confirmation },
                    }),
                  );
                }}
                done="Account banned"
              />
            )}
            <ActionDialog
              label="Sign out everywhere"
              title="Sign out of every device"
              description={`Ends their ${detail.active_sessions} open sessions. They can sign in again.`}
              run={async () =>
                unwrap(await api.POST("/admin/v1/users/{id}/sign-out-everywhere", userPath))
              }
              done="Signed out everywhere"
            />
            <ActionDialog
              label="Change role"
              title="Change their role"
              description="What they see when they sign in."
              confirm="Save role"
              run={async () =>
                unwrap(await api.PATCH("/admin/v1/users/{id}", { ...userPath, body: { role } }))
              }
              done="Role changed"
            >
              <RadioGroup
                value={role}
                onValueChange={(value) => setRole(value as Role)}
                aria-label="Role"
              >
                {(Object.keys(ROLE_NAMES) as Role[]).map((value) => (
                  <Label
                    key={value}
                    htmlFor={`role-${value}`}
                    className="flex items-center gap-3 font-normal"
                  >
                    <RadioGroupItem id={`role-${value}`} value={value} />
                    {ROLE_NAMES[value]}
                  </Label>
                ))}
              </RadioGroup>
            </ActionDialog>
          </>
        ) : null}
        {can(me, "users:delete") ? (
          <ActionDialog
            label="Delete account"
            destructive
            title="Delete this account permanently"
            description="Removes their account, profile, pictures, applications and checks. Where they were the last owner, a salon they made is deleted with its jobs and a directory listing they claimed goes back to unclaimed. This can't be undone. Asks for your passkey."
            reason={{
              label: "Reason (optional)",
              placeholder: "e.g. asked us to delete it",
              required: false,
            }}
            run={async (reason) => {
              const confirmation = await confirmWithPasskey("user.delete", user.id);
              return unwrap(
                await api.DELETE("/admin/v1/users/{id}", {
                  ...userPath,
                  body: { ...(reason ? { reason } : {}), confirmation },
                }),
              );
            }}
            done="Account deleted"
            onDone={() => navigate({ to: "/users" })}
          />
        ) : null}
        {can(me, "checks:review") ? (
          <ActionDialog
            label="Reset verifications"
            destructive
            title="Reset their verifications"
            description={`Clears all ${detail.checks.length} of their checks (identity, work rights, qualifications), so they're not verified and can verify again. Their verification IDs go too. Recorded in the audit log.`}
            reason={{
              label: "Reason (optional)",
              placeholder: "e.g. verified the wrong person, testing",
              required: false,
            }}
            run={async (reason) =>
              unwrap(
                await api.POST("/admin/v1/users/{id}/reset-verifications", {
                  ...userPath,
                  body: reason ? { reason } : {},
                }),
              )
            }
            done="Verifications reset"
          />
        ) : null}
        {!can(me, "users:ban") && !can(me, "users:delete") && !can(me, "checks:review") ? (
          <p className="text-sm text-muted-foreground">Your staff role can't change people.</p>
        ) : null}
      </div>
    </Section>
  );
}

export function UserPage() {
  const { userId } = useParams({ from: "/users/$userId" });
  const me = useQuery(meQuery).data;
  const detail = useQuery(userQuery(userId));
  const d = detail.data;
  if (detail.isError) return <FormError message={errorMessage(detail.error)} />;
  if (!d) return null;
  const { user, profile } = d;

  return (
    <>
      <p className="text-sm">
        <Link to="/users" className="text-muted-foreground hover:underline">
          ← People
        </Link>
      </p>
      <PageHeader
        title={user.name || user.email || "No name yet"}
        description={[user.email, user.phone, `joined ${formatDate(user.created_at)}`]
          .filter(Boolean)
          .join(" · ")}
      >
        <Badge variant="outline">{ROLE_NAMES[user.role]}</Badge>
        {user.id_verified ? <Badge variant="secondary">ID checked</Badge> : null}
      </PageHeader>
      {user.banned_at ? (
        <Alert variant="destructive">
          <AlertTitle>Banned {formatDate(user.banned_at)}</AlertTitle>
          <AlertDescription>
            {user.banned_reason ? `${user.banned_reason}. ` : ""}They can't sign in
            {user.role === "employer"
              ? " and their jobs are hidden"
              : " and salons no longer see their applications"}
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Account">
            <DetailList
              items={[
                [
                  "ID",
                  <span key="id" className="flex items-center gap-1 font-mono text-xs">
                    {user.id}
                    <CopyButton value={user.id} label="Copy their ID" />
                  </span>,
                ],
                ["Open sessions", d.active_sessions],
                ...(profile
                  ? ([
                      ["Profile name", `${profile.first_name} ${profile.last_name}`],
                      [
                        "Profile visible to",
                        {
                          public: "Everyone with the share link, and salons",
                          salons: "Salons",
                          hidden: "Only salons they apply to",
                        }[profile.visibility],
                      ],
                      [
                        "Salons contact them by",
                        { both: "Email and phone", email: "Email", phone: "Phone" }[
                          profile.contact_by
                        ],
                      ],
                      ["Location", `${profile.suburb}, ${profile.state} ${profile.postcode}`],
                      ["Headline", profile.headline],
                      ["Experience", `${profile.years_experience} years`],
                      ["Work rights", labelFor(RIGHT_TO_WORK, profile.right_to_work)],
                      ["Instagram", profile.instagram ? `@${profile.instagram}` : null],
                      ["TikTok", profile.tiktok ? `@${profile.tiktok}` : null],
                      ["Open to work", profile.open_to_work ? "Yes" : "No"],
                    ] as [string, string | null][])
                  : ([["Profile", "None yet"]] as [string, string][])),
              ]}
            />
          </Section>

          <Flags detail={d} canFlag={can(me, "users:flag")} />

          {d.salons.length > 0 ? (
            <Section title={d.salons.length === 1 ? "Salon" : "Salons"}>
              <ul className="divide-y">
                {d.salons.map((salon) => (
                  <li key={salon.id} className="flex flex-wrap items-center gap-2 p-4 text-sm">
                    <Link
                      to="/salons/$salonId"
                      params={{ salonId: salon.id }}
                      className="font-medium"
                    >
                      {salon.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {salon.suburb}, {salon.state}
                    </span>
                    {salon.status !== "active" ? (
                      <Badge variant="destructive">{humanize(salon.status)}</Badge>
                    ) : null}
                    <Badge variant="outline">{salon.role === "owner" ? "Owner" : "Manager"}</Badge>
                    {salon.source === "directory" ? (
                      <Badge variant="outline">Claimed listing</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section
            title="Checks"
            description="Only verification IDs and minimal results are kept once decided. Evidence waiting for a decision is in the Checks queue."
          >
            <CardTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verification ID</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.checks.map((check) => (
                    <TableRow key={check.id}>
                      <TableCell>{CHECK_KINDS[check.kind] ?? check.kind}</TableCell>
                      <TableCell>
                        {humanize(check.status)}
                        {check.status === "pending" ? (
                          <Link to="/checks" className="ml-2 text-xs underline underline-offset-4">
                            Review
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{check.reference ?? "–"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {check.result
                          ? Object.entries(check.result)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(" · ") || "–"
                          : "–"}
                        {check.review_note ? <div>Note: {check.review_note}</div> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(check.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardTable>
            {d.checks.length === 0 ? <EmptyList>No checks started.</EmptyList> : null}
          </Section>

          <Section title={`Applications (${d.applications.length})`}>
            <CardTable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Salon</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applied</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.applications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <a
                          href={`${APP_URL}${application.job.path}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {application.job.title}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Link to="/salons/$salonId" params={{ salonId: application.salon.id }}>
                          {application.salon.name}
                        </Link>
                      </TableCell>
                      <TableCell>{humanize(application.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatRelative(application.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardTable>
            {d.applications.length === 0 ? <EmptyList>No applications.</EmptyList> : null}
          </Section>

          <Section title="History">
            <div className="flex flex-col gap-3 p-4">
              <AuditLog target={user.id} days={365} />
            </div>
          </Section>
        </div>
        <aside className="flex flex-col gap-5">
          <Actions detail={d} />
        </aside>
      </div>
    </>
  );
}
