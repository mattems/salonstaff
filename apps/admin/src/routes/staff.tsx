import { STAFF_ROLES, type StaffRole } from "@salonstaff/shared";
import { CardTable } from "@salonstaff/ui/card-table";
import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
import { Avatar, AvatarFallback } from "@salonstaff/ui/components/avatar";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@salonstaff/ui/components/dialog";
import { Input } from "@salonstaff/ui/components/input";
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
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { FormError, PageHeader, Section } from "@/components/page";
import { ApiProblem, api, unwrap } from "@/lib/api";
import { confirmErrorMessage, confirmWithPasskey } from "@/lib/confirm";
import { formatDate, formatRelative, initials } from "@/lib/format";
import { can, meQuery, queryClient, type StaffMember, staffQuery } from "@/lib/queries";

const ROLES: Record<StaffRole, { label: string; does: string }> = {
  owner: { label: "Owner", does: "Everything, including deleting people and salons, and staff." },
  support: {
    label: "Support",
    does: "Decides checks and claims, bans, suspends salons, gives credits, imports listings.",
  },
  readonly: {
    label: "Read-only",
    does: "Sees people, salons, jobs, payments and the audit log. Changes nothing.",
  },
};

function RolePicker(props: {
  idPrefix: string;
  value: StaffRole;
  onChange: (role: StaffRole) => void;
}) {
  return (
    <RadioGroup
      value={props.value}
      onValueChange={(value) => props.onChange(value as StaffRole)}
      aria-label="Role"
    >
      {STAFF_ROLES.map((role) => (
        <Label
          key={role}
          htmlFor={`${props.idPrefix}-${role}`}
          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-data-checked:border-primary"
        >
          <RadioGroupItem id={`${props.idPrefix}-${role}`} value={role} className="mt-0.5" />
          <span className="grid gap-0.5">
            <span className="font-medium">{ROLES[role].label}</span>
            <span className="text-sm text-muted-foreground">{ROLES[role].does}</span>
          </span>
        </Label>
      ))}
    </RadioGroup>
  );
}

function ReasonField(props: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>Reason</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        maxLength={500}
        required
        minLength={3}
      />
      <p className="text-sm text-muted-foreground">Recorded in the audit log.</p>
    </div>
  );
}

function AddStaffDialog(props: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("support");
  const [reason, setReason] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const address = email.trim().toLowerCase();
      const confirmation = await confirmWithPasskey("staff.add", address);
      return unwrap(
        await api.POST("/admin/v1/staff", {
          body: { name: name.trim(), email: address, role, reason: reason.trim(), confirmation },
        }),
      );
    },
    onSuccess: async (member) => {
      await queryClient.invalidateQueries({ queryKey: staffQuery.queryKey });
      toast.success(`${member.name} is now staff`, {
        description: "Add their address to the Access list in Cloudflare too.",
      });
      props.onClose();
    },
  });
  const problem = add.error instanceof ApiProblem ? add.error : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a staff member</DialogTitle>
            <DialogDescription>
              They don't need a Salon Staff account. No email is sent; let them know yourself.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-name">Name</Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
              />
            </div>
          </div>
          <RolePicker idPrefix="staff-add" value={role} onChange={setRole} />
          <ReasonField
            id="staff-add-reason"
            value={reason}
            onChange={setReason}
            placeholder="e.g. joining to handle support"
          />
          <Alert>
            <AlertTitle>Also add this address in Cloudflare</AlertTitle>
            <AlertDescription>
              Staff sign in through Cloudflare Access. They can open the portal once their address
              is on both lists: this one and the Access list.
            </AlertDescription>
          </Alert>
          <FormError
            message={add.error ? confirmErrorMessage(add.error) : null}
            hint={problem?.hint}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add staff member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageStaffDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const [role, setRole] = useState<StaffRole>(member.role);
  const [reason, setReason] = useState("");
  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: staffQuery.queryKey });
    toast.success(message);
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      const confirmation = await confirmWithPasskey("staff.change_role", member.id);
      return unwrap(
        await api.PATCH("/admin/v1/staff/{id}", {
          params: { path: { id: member.id } },
          body: { role, reason: reason.trim(), confirmation },
        }),
      );
    },
    onSuccess: (changed) => done(`${changed.name} is now ${ROLES[changed.role].label}`),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const confirmation = await confirmWithPasskey("staff.remove", member.id);
      return unwrap(
        await api.DELETE("/admin/v1/staff/{id}", {
          params: { path: { id: member.id } },
          body: { reason: reason.trim(), confirmation },
        }),
      );
    },
    onSuccess: () => done(`${member.name} is no longer staff`),
  });
  const reset = useMutation({
    mutationFn: async () => {
      const confirmation = await confirmWithPasskey("staff.reset_passkeys", member.id);
      return unwrap(
        await api.DELETE("/admin/v1/staff/{id}/passkeys", {
          params: { path: { id: member.id } },
          body: { reason: reason.trim(), confirmation },
        }),
      );
    },
    onSuccess: () => done(`${member.name} can register a new passkey`),
  });
  const failed = save.error ?? remove.error ?? reset.error;
  const problem = failed instanceof ApiProblem ? failed : null;
  const busy = save.isPending || remove.isPending || reset.isPending;
  const hasReason = reason.trim().length >= 3;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{member.name}</DialogTitle>
            <DialogDescription>
              {member.email} · added {formatDate(member.added_at)}
              {member.added_by ? ` by ${member.added_by}` : ""}
            </DialogDescription>
          </DialogHeader>
          <RolePicker idPrefix="staff-manage" value={role} onChange={setRole} />
          <ReasonField
            id="staff-manage-reason"
            value={reason}
            onChange={setReason}
            placeholder="Needed to change the role or remove"
          />
          <p className="text-sm text-muted-foreground">
            Removing takes effect on their next click. Remove them from the Access list in
            Cloudflare as well.
          </p>
          {member.passkeys > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <p className="text-sm text-muted-foreground">
                Lost their passkeys? Resetting removes all {member.passkeys}, so they can register
                again. It asks for your own passkey.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !hasReason}
                onClick={() => reset.mutate()}
              >
                {reset.isPending ? "Waiting for your passkey…" : "Reset passkeys"}
              </Button>
            </div>
          ) : null}
          <FormError message={failed ? confirmErrorMessage(failed) : null} hint={problem?.hint} />
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !hasReason}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Removing…" : "Remove from staff"}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || role === member.role}>
                {save.isPending ? "Saving…" : "Save role"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffPage() {
  const me = useQuery(meQuery);
  const allowed = me.data ? can(me.data, "staff:manage") : false;
  const staff = useQuery({ ...staffQuery, enabled: allowed });
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<StaffMember | null>(null);
  if (!me.data) return null;

  if (!allowed) {
    return (
      <>
        <PageHeader title="Staff" description="Who can use this portal, and as what." />
        <Alert>
          <AlertTitle>Only owners manage staff</AlertTitle>
          <AlertDescription>Ask a staff owner to add someone or change a role.</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Staff" description="Who can use this portal, and as what.">
        <Button onClick={() => setAdding(true)}>
          <Plus />
          Add staff member
        </Button>
      </PageHeader>
      <Section>
        <CardTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Passkeys</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Last used the portal</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.data?.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="grid leading-tight">
                        <span className="flex items-center gap-2 font-medium">
                          {member.name}
                          {member.is_you ? <Badge variant="outline">You</Badge> : null}
                        </span>
                        <span className="text-sm text-muted-foreground">{member.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{ROLES[member.role].label}</TableCell>
                  <TableCell>
                    {member.passkeys > 0 ? member.passkeys : <Badge variant="outline">None</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="grid leading-tight">
                      <span>{formatDate(member.added_at)}</span>
                      <span className="text-sm text-muted-foreground">
                        {member.added_by ? `by ${member.added_by}` : "set up by script"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {member.last_seen_at ? formatRelative(member.last_seen_at) : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.is_you ? null : (
                      <Button variant="outline" size="sm" onClick={() => setManaging(member)}>
                        Manage
                        <span className="sr-only"> {member.name}</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardTable>
      </Section>
      <Alert>
        <AlertTitle>
          Staff sign in through Cloudflare Access, with no Salon Staff account
        </AlertTitle>
        <AlertDescription>
          Each person must be on two lists: this one, and the Access list in Cloudflare. Someone on
          only one of them can't get in.
        </AlertDescription>
      </Alert>
      {adding ? <AddStaffDialog onClose={() => setAdding(false)} /> : null}
      {managing ? <ManageStaffDialog member={managing} onClose={() => setManaging(null)} /> : null}
    </>
  );
}
