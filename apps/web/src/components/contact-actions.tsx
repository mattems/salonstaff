/**
 * How a salon's team gets in touch with a job seeker (D-13): a message we email to them (replies
 * come back to the sender), and their mobile, shown on request. Both are recorded and limited.
 */
import { contactMessageSchema } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@salonstaff/ui/components/dialog";
import { Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { localMobile } from "@/components/account-security";
import { FormMessage, parse, SubmitButton, TextAreaField, useAction } from "@/components/form";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";

export function ContactActions({
  salonId,
  salonName,
  candidateId,
  firstName,
  contact,
}: {
  salonId: string;
  salonName: string;
  candidateId: string;
  firstName: string;
  contact: Schemas["ContactOptions"];
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const path = { salonId, userId: candidateId };

  if (!contact.message && !contact.phone) {
    return <p className="text-muted-foreground text-sm">You can't contact this person.</p>;
  }

  async function reveal() {
    setRevealing(true);
    try {
      const result = unwrap(
        await api.POST("/v1/employer/salons/{salonId}/candidates/{userId}/phone", {
          params: { path },
        }),
      );
      setPhone(result.phone);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {contact.message && (
          <MessageDialog salonName={salonName} firstName={firstName} path={path} />
        )}
        {contact.phone &&
          (phone ? (
            <Button asChild variant="outline">
              <a href={`tel:${phone}`}>
                <Phone aria-hidden />
                Call {localMobile(phone)}
              </a>
            </Button>
          ) : (
            <Button variant="outline" disabled={revealing} onClick={reveal}>
              <Phone aria-hidden />
              Show number
            </Button>
          ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {firstName} sees which salons message them or look at their number.
      </p>
    </div>
  );
}

function MessageDialog({
  salonName,
  firstName,
  path,
}: {
  salonName: string;
  firstName: string;
  path: { salonId: string; userId: string };
}) {
  const [open, setOpen] = useState(false);
  const action = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Contact {firstName}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {firstName}</DialogTitle>
          <DialogDescription>
            We email it to {firstName} from {salonName}. Their reply comes straight to your email.
            You can message each person once a day.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={action.submit(async (form) => {
            const body = parse(contactMessageSchema, {
              message: String(form.get("message") ?? ""),
            });
            unwrap(
              await api.POST("/v1/employer/salons/{salonId}/candidates/{userId}/messages", {
                params: { path },
                body,
              }),
            );
            setOpen(false);
            toast.success(`Sent. ${firstName}'s reply will come to your email.`);
          })}
        >
          <TextAreaField
            label="Your message"
            name="message"
            rows={6}
            maxLength={2000}
            required
            placeholder={`Hi ${firstName}, we loved your work and wondered if you'd come in for a chat…`}
            error={action.errors.message}
          />
          <FormMessage message={action.message} />
          <DialogFooter>
            <SubmitButton pending={action.pending}>Send message</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
