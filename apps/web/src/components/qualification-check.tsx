/**
 * A qualification (an education entry) and its check: where it's up to, and the certificate upload
 * to verify it. Used in the education section and on the verification page, so they're one thing.
 */
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { cn } from "@salonstaff/ui/lib/utils";
import { BadgeCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useRefresh } from "@/components/account-profile";
import { FormError, FormMessage, SubmitButton, useAction } from "@/components/form";
import { api, multipart, type Schemas, unwrap } from "@/lib/api";

type Education = Schemas["Education"];

/** "Verified" with a tick, for a qualification that passed. Shown wherever the profile is. */
export function VerifiedTick({
  reference,
  className,
}: {
  reference?: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 font-medium text-xs", className)}
      title={reference ? `Verification ID ${reference}` : "Checked by Salon Staff"}
    >
      <BadgeCheck className="size-4" aria-hidden />
      Verified
      {reference && (
        <span className="font-mono font-normal text-muted-foreground">{reference}</span>
      )}
    </span>
  );
}

const STATUS: Record<Schemas["Verification"]["identity"], string> = {
  not_started: "Not verified",
  pending: "In review",
  requires_input: "Needs another try",
  verified: "Verified",
  failed: "Not verified: try again",
  expired: "Verify again",
};

/** One qualification with its status and, until it's verified, a way to send the certificate. */
export function QualificationItem({ item, actions }: { item: Education; actions?: ReactNode }) {
  const refresh = useRefresh();
  const action = useAction();
  const [open, setOpen] = useState(false);
  const status = item.verification?.status ?? "not_started";
  const canSend = status !== "verified" && status !== "pending";

  return (
    <li className="space-y-2 py-3 text-sm first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {item.qualification}
            {status === "verified" ? (
              <VerifiedTick reference={item.verification?.reference} />
            ) : (
              <Badge variant="outline">{STATUS[status]}</Badge>
            )}
          </p>
          {(item.institution || item.year) && (
            <p className="text-muted-foreground">
              {[item.institution, item.year].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canSend && !open && (
            <Button size="xs" onClick={() => setOpen(true)}>
              Verify
            </Button>
          )}
          {actions}
        </div>
      </div>
      {canSend && open && (
        <form
          className="grid gap-2 rounded-lg border p-3"
          onSubmit={action.submit(async (form) => {
            const file = form.get("file");
            if (!(file instanceof File) || file.size === 0)
              throw new FormError("Choose your certificate first");
            form.set("educationId", item.id);
            unwrap(await api.POST("/v1/me/checks/qualification", multipart(form)));
            setOpen(false);
            await refresh("Certificate sent. We'll check it, usually within two business days.");
          })}
        >
          <p className="text-muted-foreground text-xs">
            Your certificate for {item.qualification}: a PDF or a photo, up to 8MB. We keep it
            privately until we've checked it, then delete it.
          </p>
          <Input
            type="file"
            name="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
            aria-label={`Certificate for ${item.qualification}`}
          />
          <FormMessage message={action.message} />
          <div className="flex gap-2">
            <SubmitButton pending={action.pending} size="sm">
              Send for checking
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
