import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  FormMessage,
  formText,
  SelectField,
  SubmitButton,
  TextField,
  useAction,
} from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";
import { forgetMe } from "@/lib/session";

/** A salon's team (D-11): owners and managers, and invites. Owners change it; anyone can leave. */
export const Route = createFileRoute("/employer/$salonId/team")({
  loader: async ({ context, params }) => {
    const team = await api.GET("/v1/employer/salons/{salonId}/team", {
      params: { path: { salonId: params.salonId } },
    });
    return { salon: context.salon, team: unwrap(team) };
  },
  head: () => privatePage("Team"),
  component: Team,
});

const ROLES = [
  { value: "manager", label: "Manager" },
  { value: "owner", label: "Owner" },
] as const;
const ROLE = { owner: "Owner", manager: "Manager" } as const;

function Team() {
  const { salon, team } = Route.useLoaderData();
  const owner = salon.role === "owner";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Managers post jobs and look after applicants. Owners can also change the salon's details, billing and team. A salon always has at least one owner."
      />
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.members.map((member) => (
                <MemberRow key={member.userId} member={member} canManage={owner} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {owner && <InviteCard />}
      {team.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invites waiting</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Link expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.invites.map((invite) => (
                  <InviteRow key={invite.id} invite={invite} canManage={owner} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Runs a change, then reloads the page's data; a refusal (e.g. the last owner) is a toast. */
function useChange() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const run = async (change: () => Promise<unknown>, done: string) => {
    setPending(true);
    try {
      await change();
      toast.success(done);
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
}

function MemberRow({ member, canManage }: { member: Schemas["TeamMember"]; canManage: boolean }) {
  const { salonId } = Route.useParams();
  const navigate = useNavigate();
  const { pending, run } = useChange();
  const path = { salonId, userId: member.userId };
  const setRole = (role: "owner" | "manager") =>
    run(
      async () =>
        unwrap(
          await api.PATCH("/v1/employer/salons/{salonId}/team/{userId}", {
            params: { path },
            body: { role },
          }),
        ),
      "Role changed",
    );
  const remove = async () => {
    const leaving = member.you;
    if (!window.confirm(leaving ? "Leave this salon?" : `Take ${member.name} off the team?`)) {
      return;
    }
    await run(
      async () => {
        unwrap(
          await api.DELETE("/v1/employer/salons/{salonId}/team/{userId}", { params: { path } }),
        );
        if (leaving) {
          forgetMe();
          await navigate({ to: "/employer" });
        }
      },
      leaving ? "You've left the salon" : "Taken off the team",
    );
  };
  return (
    <TableRow>
      <TableCell className="font-medium">
        {member.name || "–"} {member.you && <Badge variant="secondary">You</Badge>}
      </TableCell>
      <TableCell>{member.email ?? "Mobile only"}</TableCell>
      <TableCell>{ROLE[member.role]}</TableCell>
      <TableCell>{formatDate(member.joinedAt)}</TableCell>
      <TableCell className="space-x-2 text-right">
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setRole(member.role === "owner" ? "manager" : "owner")}
          >
            {member.role === "owner" ? "Make manager" : "Make owner"}
          </Button>
        )}
        {(canManage || member.you) && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={remove}>
            {member.you ? "Leave" : "Remove"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function InviteRow({ invite, canManage }: { invite: Schemas["TeamInvite"]; canManage: boolean }) {
  const { salonId } = Route.useParams();
  const { pending, run } = useChange();
  return (
    <TableRow>
      <TableCell>{invite.email}</TableCell>
      <TableCell>{ROLE[invite.role]}</TableCell>
      <TableCell>{formatDate(invite.expiresAt)}</TableCell>
      <TableCell className="text-right">
        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                async () =>
                  unwrap(
                    await api.DELETE("/v1/employer/salons/{salonId}/team/invites/{inviteId}", {
                      params: { path: { salonId, inviteId: invite.id } },
                    }),
                  ),
                "Invite cancelled",
              )
            }
          >
            Cancel
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function InviteCard() {
  const { salonId } = Route.useParams();
  const router = useRouter();
  const action = useAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>
          We email them a link that lasts 7 days. They can sign in or sign up however they like.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={action.submit(
            async (form) => {
              const { email = "", role = "manager" } = formText(form);
              unwrap(
                await api.POST("/v1/employer/salons/{salonId}/team/invites", {
                  params: { path: { salonId } },
                  body: { email, role: role as "owner" | "manager" },
                }),
              );
              toast.success(`Invite sent to ${email}`);
              await router.invalidate();
            },
            { reset: true },
          )}
        >
          <TextField label="Email" name="email" type="email" required error={action.errors.email} />
          <SelectField label="Role" name="role" options={ROLES} defaultValue="manager" />
          <SubmitButton pending={action.pending}>Send invite</SubmitButton>
        </form>
        <FormMessage message={action.message} />
      </CardContent>
    </Card>
  );
}
