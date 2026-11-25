import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@salonstaff/ui/components/alert-dialog";
import { Button } from "@salonstaff/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { pendingChoice } from "@/lib/confirm";

/**
 * Local development only. A change that needs a passkey asks here first:
 * use one, or skip. Deployed, the API never offers the skip and this never opens.
 */
export function ConfirmChoiceDialog() {
  const pending = useSyncExternalStore(pendingChoice.subscribe, pendingChoice.get);
  if (!pending) return null;
  return (
    <AlertDialog open>
      <AlertDialogContent onEscapeKeyDown={() => pending.choose("cancel")}>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm with your passkey</AlertDialogTitle>
          <AlertDialogDescription>
            {pending.hasPasskey ? (
              "This change needs your passkey. In local development you can skip it."
            ) : (
              <>
                This change needs a passkey and you have none. Skip it, or add one under{" "}
                <Link to="/passkeys" className="underline" onClick={() => pending.choose("cancel")}>
                  Your passkeys
                </Link>
                .
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => pending.choose("cancel")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => pending.choose("skip")}>
            Skip (dev only)
          </Button>
          <Button disabled={!pending.hasPasskey} onClick={() => pending.choose("passkey")}>
            Use passkey
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
