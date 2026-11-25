import { CardTable } from "@salonstaff/ui/card-table";
import { Alert, AlertDescription, AlertTitle } from "@salonstaff/ui/components/alert";
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
import { useState } from "react";
import { toast } from "sonner";
import { EmptyList, FormError, PageHeader, Section } from "@/components/page";
import { ApiProblem, api, unwrap } from "@/lib/api";
import { confirmErrorMessage, confirmWithPasskey, registerPasskey } from "@/lib/confirm";
import { formatDate, formatRelative } from "@/lib/format";
import { type Passkey, passkeysQuery, queryClient, staffQuery } from "@/lib/queries";

const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: passkeysQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: staffQuery.queryKey }),
  ]);

function NameField(props: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>Name</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="e.g. MacBook, YubiKey"
        maxLength={60}
        required
        autoFocus
      />
    </div>
  );
}

function AddPasskeyDialog(props: { hasOne: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => registerPasskey(name.trim(), props.hasOne),
    onSuccess: async (passkey) => {
      await refresh();
      toast.success(`${passkey.name} is registered`);
      props.onClose();
    },
  });
  const problem = add.error instanceof ApiProblem ? add.error : null;

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a passkey</DialogTitle>
            <DialogDescription>
              {props.hasOne
                ? "Your browser asks for a passkey you already have, then for the new one."
                : "Your browser asks for your fingerprint, face, PIN or security key."}
            </DialogDescription>
          </DialogHeader>
          <NameField id="passkey-name" value={name} onChange={setName} />
          <FormError
            message={add.error ? confirmErrorMessage(add.error) : null}
            hint={problem?.hint}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Waiting for your passkey…" : "Add passkey"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagePasskeyDialog({ passkey, onClose }: { passkey: Passkey; onClose: () => void }) {
  const [name, setName] = useState(passkey.name);
  const done = async (message: string) => {
    await refresh();
    toast.success(message);
    onClose();
  };
  const rename = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.PATCH("/admin/v1/passkeys/{id}", {
          params: { path: { id: passkey.id } },
          body: { name: name.trim() },
        }),
      ),
    onSuccess: (renamed) => done(`Renamed to ${renamed.name}`),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const confirmation = await confirmWithPasskey("passkey.remove", passkey.id);
      return unwrap(
        await api.DELETE("/admin/v1/passkeys/{id}", {
          params: { path: { id: passkey.id } },
          body: { confirmation },
        }),
      );
    },
    onSuccess: () => done(`${passkey.name} is removed`),
  });
  const failed = rename.error ?? remove.error;
  const problem = failed instanceof ApiProblem ? failed : null;
  const busy = rename.isPending || remove.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{passkey.name}</DialogTitle>
            <DialogDescription>
              Added {formatDate(passkey.added_at)}. Removing it asks for one of your passkeys.
            </DialogDescription>
          </DialogHeader>
          <NameField id="passkey-rename" value={name} onChange={setName} />
          <FormError message={failed ? confirmErrorMessage(failed) : null} hint={problem?.hint} />
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Waiting for your passkey…" : "Remove passkey"}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || name.trim() === passkey.name}>
                {rename.isPending ? "Saving…" : "Save name"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PasskeysPage() {
  const passkeys = useQuery(passkeysQuery);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<Passkey | null>(null);
  const mine = passkeys.data ?? [];

  return (
    <>
      <PageHeader
        title="Your passkeys"
        description="What you confirm dangerous changes with, such as banning someone or deleting a salon."
      >
        <Button onClick={() => setAdding(true)}>
          <Plus />
          Add passkey
        </Button>
      </PageHeader>
      <Section>
        {passkeys.isSuccess && mine.length === 0 ? (
          <EmptyList>
            You have no passkey yet. Until you add one you can't make changes that need confirming.
          </EmptyList>
        ) : (
          <CardTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map((passkey) => (
                  <TableRow key={passkey.id}>
                    <TableCell className="font-medium">{passkey.name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(passkey.added_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {passkey.last_used_at ? formatRelative(passkey.last_used_at) : "never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setManaging(passkey)}>
                        Manage
                        <span className="sr-only"> {passkey.name}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardTable>
        )}
      </Section>
      <Alert>
        <AlertTitle>Add a second one, on another device</AlertTitle>
        <AlertDescription>
          If you lose your only passkey, a staff owner has to reset it before you can register
          again. A passkey works only on this address, so a new portal address means registering
          again.
        </AlertDescription>
      </Alert>
      {adding ? (
        <AddPasskeyDialog hasOne={mine.length > 0} onClose={() => setAdding(false)} />
      ) : null}
      {managing ? (
        <ManagePasskeyDialog passkey={managing} onClose={() => setManaging(null)} />
      ) : null}
    </>
  );
}
