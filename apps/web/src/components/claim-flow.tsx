/**
 * Claiming a listed salon (D-04, D-22): the ABN must match, then the claimant types a code sent
 * to the listing's own email or mobile, or staff check it. Codes only ever go to details already
 * on the listing, shown masked. Used by the add-a-salon wizard and the listing's claim page.
 */
import { Button } from "@salonstaff/ui/components/button";
import { Checkbox } from "@salonstaff/ui/components/checkbox";
import { Label } from "@salonstaff/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@salonstaff/ui/components/radio-group";
import { Skeleton } from "@salonstaff/ui/components/skeleton";
import { cn } from "@salonstaff/ui/lib/utils";
import { useRouter } from "@tanstack/react-router";
import {
  MailIcon,
  MessageSquareIcon,
  PhoneCallIcon,
  ShieldCheckIcon,
  UserCheckIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, orNull, type Schemas, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { forgetMe, type Me } from "@/lib/session";
import { FormError, FormMessage, formText, SubmitButton, TextField, useAction } from "./form";
import { Notice } from "./page";

type Claim = Schemas["Claim"];
type Options = Schemas["ClaimOptions"];
type Method = Options["methods"][number]["method"];
export type ClaimedSalon = Schemas["MySalon"];

interface StartBody {
  abn?: string;
  contactName: string;
  phone: string;
  method: Method;
}

export function ClaimFlow({
  salonId,
  salonName,
  me,
  onClaimed,
}: {
  salonId: string;
  salonName: string;
  me: Me;
  /** Once the claim is approved, with the salon as the claimant now sees it. */
  onClaimed: (salon: ClaimedSalon) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [claim, setClaim] = useState<Claim | null | undefined>(undefined);
  const [lastStart, setLastStart] = useState<StartBody | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = { params: { path: { id: salonId } } };
      const [opts, mine] = await Promise.all([
        api.GET("/v1/salons/{id}/claim-options", params),
        api.GET("/v1/salons/{id}/claims/mine", params),
      ]);
      setOptions(unwrap(opts));
      setClaim(orNull(mine));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, [salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) return <Notice tone="destructive">{loadError}</Notice>;
  if (!options || claim === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (claim?.status === "approved") {
    return (
      <Notice title={`${salonName} is yours`}>
        <Button size="sm" className="mt-2" onClick={() => void openSalon(claim.salonId, onClaimed)}>
          Continue
        </Button>
      </Notice>
    );
  }
  if (claim?.status === "pending_review") {
    return (
      <Notice title="We're checking your claim">
        Salon Staff is checking the ABN and that you run {salonName}; we may phone the business.
        We'll email you once it's decided, and then it's in your salons.
      </Notice>
    );
  }
  if (claim?.status === "pending_email" && !starting) {
    return (
      <EnterCode
        claim={claim}
        salonName={salonName}
        codeAttempts={options.codeAttempts}
        canResend={lastStart !== null}
        onResend={async () => {
          if (!lastStart) return;
          const fresh = unwrap(
            await api.POST("/v1/salons/{id}/claims", {
              params: { path: { id: salonId } },
              body: lastStart,
            }),
          );
          setClaim(fresh);
          toast.success("We've sent a new code");
        }}
        onStartAgain={() => setStarting(true)}
        onReview={async () => {
          const reviewed = unwrap(
            await api.POST("/v1/claims/{id}/review", { params: { path: { id: claim.id } } }),
          );
          setClaim(reviewed);
        }}
        onClaimed={onClaimed}
      />
    );
  }
  return (
    <div className="space-y-4">
      {claim?.status === "rejected" && claim.decisionNote !== "Started again" && (
        <Notice title="Your last claim wasn't approved" tone="destructive">
          {claim.decisionNote ?? "Check the details and try again."}
        </Notice>
      )}
      {options.claimed && (
        <Notice title={`${salonName} is already managed on Salon Staff`}>
          If you've taken over the business, claim it with the same checks: you'll become one of its
          owners and we'll email the others. To join its team instead, ask an owner to invite you.
        </Notice>
      )}
      <StartClaim
        salonId={salonId}
        options={options}
        me={me}
        onStarted={(started, body) => {
          setClaim(started);
          setLastStart(body);
          setStarting(false);
        }}
      />
    </div>
  );
}

async function openSalon(salonId: string, onClaimed: (salon: ClaimedSalon) => void) {
  forgetMe();
  const salon = unwrap(
    await api.GET("/v1/employer/salons/{salonId}", { params: { path: { salonId } } }),
  );
  onClaimed(salon);
}

const METHOD_TEXT: Record<Method, { title: string; detail: (sentTo: string | null) => string }> = {
  email: {
    title: "Email a code to the business",
    detail: (to) => `To ${to}, the email on the listing.`,
  },
  phone: {
    title: "Text a code to the salon's mobile",
    detail: (to) => `To ${to}, the mobile on the listing.`,
  },
  call: {
    title: "Call the salon's phone with a code",
    detail: (to) =>
      `We'll ring ${to}, the number on the listing, and read out a code twice. Be by that phone.`,
  },
  review: {
    title: "Have Salon Staff check",
    detail: () =>
      "If you can't get to the listing's email or phone. We check the ABN and may phone the business, so it takes longer.",
  },
};

const METHOD_ICON = {
  email: MailIcon,
  phone: MessageSquareIcon,
  call: PhoneCallIcon,
  review: UserCheckIcon,
};

function StartClaim({
  salonId,
  options,
  me,
  onStarted,
}: {
  salonId: string;
  options: Options;
  me: Me;
  onStarted: (claim: Claim, body: StartBody) => void;
}) {
  const action = useAction();
  const [method, setMethod] = useState<Method>(
    options.methods.find((m) => !m.unavailable)?.method ?? "review",
  );
  const [agreed, setAgreed] = useState(false);
  const agreeId = useId();
  return (
    <form
      className="space-y-5"
      onSubmit={action.submit(async (form) => {
        if (!agreed) throw new FormError("Tick the box to confirm you run this business.");
        const values = formText(form);
        const body: StartBody = {
          ...(values.abn ? { abn: values.abn } : {}),
          contactName: values.contactName ?? "",
          phone: values.phone ?? "",
          method,
        };
        const started = unwrap(
          await api.POST("/v1/salons/{id}/claims", { params: { path: { id: salonId } }, body }),
        );
        onStarted(started, body);
      })}
    >
      <TextField
        label={method === "review" ? "The business's ABN" : "The business's ABN (optional)"}
        name="abn"
        inputMode="numeric"
        required={method === "review"}
        hint={
          method === "review"
            ? `Salon Staff checks it${options.abnOnFile ? " against the one we have for this business" : " on the Australian Business Register"}.`
            : `Once it's checked, your salon shows as a verified business${options.abnOnFile ? ". It must match the one we have for this business" : ""}. You can add it later under Salon details.`
        }
        error={action.errors.abn}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Your name"
          name="contactName"
          required
          autoComplete="name"
          defaultValue={me.name}
          error={action.errors.contactName}
        />
        <TextField
          label="Your phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          defaultValue={me.phoneNumber ?? ""}
          error={action.errors.phone}
        />
      </div>
      <fieldset className="space-y-3">
        <legend className="font-medium text-sm">How should we check it's yours?</legend>
        <RadioGroup
          value={method}
          onValueChange={(value) => setMethod(value as Method)}
          className="gap-2"
        >
          {options.methods.map(({ method: m, sentTo, unavailable }) => {
            const Icon = METHOD_ICON[m];
            const id = `${agreeId}-${m}`;
            return (
              <Label
                key={m}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal",
                  method === m && "border-primary bg-muted/50",
                  unavailable && "cursor-not-allowed opacity-60",
                )}
              >
                <RadioGroupItem
                  value={m}
                  id={id}
                  disabled={Boolean(unavailable)}
                  className="mt-0.5"
                />
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="grid gap-0.5">
                  <span className="font-medium">{METHOD_TEXT[m].title}</span>
                  <span className="text-muted-foreground text-xs">
                    {unavailable ?? METHOD_TEXT[m].detail(sentTo)}
                  </span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
        {options.methods.length === 1 && (
          <p className="text-muted-foreground text-xs">
            This listing has no email or phone we can send a code to, so Salon Staff checks it.
          </p>
        )}
      </fieldset>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground text-xs">
          To keep salons safe, codes only go to the email and phone already on the listing, never to
          ones you type, and the message says who asked.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id={agreeId}
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor={agreeId} className="font-normal text-sm leading-snug">
          I own or manage this business, or I'm authorised to act for it. Claiming a business I
          don't run is against Salon Staff's terms.
        </Label>
      </div>
      <FormMessage message={action.message} />
      <SubmitButton pending={action.pending}>
        {method === "review" ? "Send for checking" : "Send the code"}
      </SubmitButton>
    </form>
  );
}

/** "The code lasts 10 minutes." from when it was sent and when it stops working. */
function lasts(sentAt: string, expiresAt: string | null): string {
  if (!expiresAt) return "";
  const minutes = Math.round((Date.parse(expiresAt) - Date.parse(sentAt)) / 60_000);
  const span =
    minutes >= 120
      ? `${Math.round(minutes / 60)} hours`
      : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `The code lasts ${span}.`;
}

function EnterCode({
  claim,
  salonName,
  codeAttempts,
  canResend,
  onResend,
  onStartAgain,
  onReview,
  onClaimed,
}: {
  claim: Claim;
  salonName: string;
  codeAttempts: number;
  canResend: boolean;
  onResend: () => Promise<void>;
  onStartAgain: () => void;
  onReview: () => Promise<void>;
  onClaimed: (salon: ClaimedSalon) => void;
}) {
  const router = useRouter();
  const action = useAction();
  const other = useAction();
  const where =
    claim.sentTo ??
    (claim.via === "phone"
      ? "the salon's mobile"
      : claim.via === "call"
        ? "the salon's phone"
        : "the business's email");
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="font-medium">
          {claim.via === "phone"
            ? "We've texted a code to "
            : claim.via === "call"
              ? "We're calling "
              : "We've emailed a code to "}
          {where}
          {claim.via === "call" && " now"}
        </p>
        <p className="text-muted-foreground text-sm">
          Sent {formatDate(claim.createdAt)}.{" "}
          {claim.via === "phone"
            ? "Ask whoever has that phone for it if it isn't yours."
            : claim.via === "call"
              ? "Answer it: a recording reads out a 6-digit code, more than once. Missed it? Call again in 5 minutes."
              : "Check the spam folder too. The email also has a button that does the same."}{" "}
          {lasts(claim.createdAt, claim.codeExpiresAt)}
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={action.submit(async (form) => {
          const code = String(form.get("code") ?? "").replace(/\D/g, "");
          if (code.length !== 6) throw new FormError("Enter the 6-digit code.");
          const done = unwrap(
            await api.POST("/v1/claims/{id}/code", {
              params: { path: { id: claim.id } },
              body: { code },
            }),
          );
          forgetMe();
          toast.success(`${done.salon.name} is yours`);
          await router.invalidate();
          onClaimed(done.salon);
        })}
      >
        <TextField
          label="Code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder="123456"
          className="max-w-48"
          autoFocus
          hint={`${codeAttempts} tries, then start again.`}
          error={
            action.errors.code &&
            [action.errors.code, action.problem?.hint].filter(Boolean).join(". ")
          }
        />
        {!action.errors.code && <FormMessage message={action.message} />}
        <SubmitButton pending={action.pending}>Confirm {salonName}</SubmitButton>
      </form>
      <div className="space-y-2 border-t pt-4 text-sm">
        <p className="text-muted-foreground">Didn't get it?</p>
        <div className="flex flex-wrap gap-2">
          {canResend ? (
            <Button
              variant="outline"
              size="sm"
              disabled={other.pending}
              onClick={() => other.run(onResend)}
            >
              {claim.via === "call" ? "Call again" : "Send a new code"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onStartAgain}>
              Start again
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={other.pending}
            onClick={() => other.run(onReview)}
          >
            Ask Salon Staff to check instead
          </Button>
        </div>
        <FormMessage message={other.message} />
      </div>
    </div>
  );
}
