import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@salonstaff/ui/components/alert-dialog";
import { Button } from "@salonstaff/ui/components/button";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, unwrap } from "@/lib/api";
import { forgetMe } from "@/lib/session";

/** "Delete my account", asked twice, then signed out and home. `warning` says what goes. */
export function DeleteAccountButton({ warning }: { warning: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function remove() {
    setPending(true);
    try {
      unwrap(await api.DELETE("/v1/me"));
      forgetMe();
      toast.success("Your account has been deleted");
      await navigate({ to: "/" });
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete my account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>{warning}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my account</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={remove}>
            Delete everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
