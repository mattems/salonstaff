import { Button } from "@salonstaff/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@salonstaff/ui/components/dialog";
import { Label } from "@salonstaff/ui/components/label";
import { Textarea } from "@salonstaff/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/page";
import { ApiProblem } from "@/lib/api";
import { confirmErrorMessage } from "@/lib/confirm";
import { refreshAll } from "@/lib/queries";

/**
 * A button that opens a dialog for one change: what it does, an optional reason, and the
 * button that makes it. Errors stay in the dialog with the API's hint; success refreshes
 * everything on screen and says so in a toast.
 */
export function ActionDialog(props: {
  label: ReactNode;
  title: string;
  description?: ReactNode;
  /** The dialog's confirm button. Defaults to `title`. */
  confirm?: string;
  destructive?: boolean;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  size?: "default" | "sm";
  disabled?: boolean;
  /** Ask for a reason (recorded in the audit log, or told to the person). */
  reason?: { label: string; placeholder?: string; required: boolean; hint?: string };
  /** More fields, above the reason. */
  children?: ReactNode;
  /** Makes the change. Throws (an `ApiProblem`, or a passkey prompt closed) to stay open. */
  run: (reason: string) => Promise<unknown>;
  done: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const action = useMutation({
    mutationFn: () => props.run(reason.trim()),
    onSuccess: async () => {
      setOpen(false);
      setReason("");
      toast.success(props.done);
      // First, so a page about something just deleted isn't asked for again.
      props.onDone?.();
      await refreshAll();
    },
  });
  const problem = action.error instanceof ApiProblem ? action.error : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    action.mutate();
  };
  const tooShort = props.reason?.required ? reason.trim().length < 3 : false;

  return (
    <>
      <Button
        type="button"
        variant={props.variant ?? (props.destructive ? "destructive" : "outline")}
        size={props.size ?? "sm"}
        disabled={props.disabled}
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
      >
        {props.label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{props.title}</DialogTitle>
              {props.description ? (
                <DialogDescription>{props.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            {props.children}
            {props.reason ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="action-reason">{props.reason.label}</Label>
                <Textarea
                  id="action-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={props.reason.placeholder}
                  maxLength={500}
                  rows={3}
                />
                {props.reason.hint ? (
                  <p className="text-sm text-muted-foreground">{props.reason.hint}</p>
                ) : null}
              </div>
            ) : null}
            <FormError
              message={action.error ? confirmErrorMessage(action.error) : null}
              hint={problem?.hint}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={props.destructive ? "destructive" : "default"}
                disabled={action.isPending || tooShort}
              >
                {action.isPending ? "Working…" : (props.confirm ?? props.title)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
