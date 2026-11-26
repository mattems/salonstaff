import {
  CONTACT_LIMITS,
  ENDORSEMENT_RELATIONSHIPS,
  endorsementRequestSchema,
  labelFor,
  PROFILE_LIMITS,
} from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { NeedsProfile, SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import {
  FormMessage,
  formText,
  parse,
  SubmitButton,
  TextAreaField,
  TextField,
  useAction,
} from "@/components/form";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/endorsements")({
  loader: async () => unwrap(await api.GET("/v1/me/endorsements")),
  head: () => privatePage("Your endorsements"),
  component: Endorsements,
});

type Item = Schemas["MyEndorsement"];

const STATUS: Record<Item["status"], string> = {
  requested: "Waiting for them",
  received: "New: show it?",
  shown: "On your profile",
  hidden: "Hidden",
};

function Endorsements() {
  const full = useMyProfile();
  const { items } = Route.useLoaderData();
  if (!full) return <NeedsProfile />;
  const written = items.filter((e) => e.status !== "requested");
  const waiting = items.filter((e) => e.status === "requested");
  return (
    <div className="space-y-6">
      <Ask />
      <SectionCard
        title="Your endorsements"
        description={`Choose which to show on your profile, up to ${PROFILE_LIMITS.endorsements}. You can't change what someone wrote.`}
      >
        {written.length === 0 ? (
          <p className="text-muted-foreground text-sm">None written yet.</p>
        ) : (
          <ul className="divide-y">
            {written.map((item) => (
              <Written key={item.id} item={item} />
            ))}
          </ul>
        )}
      </SectionCard>
      {waiting.length > 0 && (
        <SectionCard title="Waiting for an answer">
          <ul className="divide-y">
            {waiting.map((item) => (
              <Waiting key={item.id} item={item} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function Ask() {
  const refresh = useRefresh();
  const action = useAction();
  return (
    <SectionCard
      title="Ask for an endorsement"
      description="Someone you've worked with: a salon owner, manager, colleague or educator. We email them a link to write a few words about you. It works once."
      footer={
        <p className="pb-4">
          Endorsements from someone on a salon's team here are marked as such. Ask at their own
          address, not yours. Up to {CONTACT_LIMITS.endorsementRequestsPerDay} a day.
        </p>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={action.submit(
          async (form) => {
            const body = parse(endorsementRequestSchema, formText(form));
            unwrap(await api.POST("/v1/me/endorsements", { body }));
            await refresh(`Sent to ${body.refereeEmail}`);
          },
          { reset: true },
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Their name"
            name="refereeName"
            required
            error={action.errors.refereeName}
          />
          <TextField
            label="Their email"
            name="refereeEmail"
            type="email"
            required
            error={action.errors.refereeEmail}
          />
        </div>
        <TextAreaField
          label="A note to them (optional)"
          name="note"
          rows={2}
          maxLength={300}
          placeholder="Would you mind writing a few words about our time at…"
          error={action.errors.note}
        />
        <FormMessage message={action.message} />
        <div>
          <SubmitButton pending={action.pending}>Send request</SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}

function useItemAction() {
  const refresh = useRefresh();
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async (work: () => Promise<string>) => {
      setPending(true);
      try {
        await refresh(await work());
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setPending(false);
      }
    },
  };
}

const removeOne = async (id: string) => {
  unwrap(await api.DELETE("/v1/me/endorsements/{id}", { params: { path: { id } } }));
};

function Written({ item }: { item: Item }) {
  const { pending, run } = useItemAction();
  const show = (shown: boolean) =>
    run(async () => {
      unwrap(
        await api.PATCH("/v1/me/endorsements/{id}", {
          params: { path: { id: item.id } },
          body: { shown },
        }),
      );
      return shown ? "Shown on your profile" : "Hidden";
    });
  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.refereeName}</span>
        <Badge variant={item.status === "received" ? "default" : "outline"}>
          {STATUS[item.status]}
        </Badge>
        {item.onSalonStaff && <Badge variant="secondary">On Salon Staff</Badge>}
      </div>
      <p className="text-muted-foreground text-sm">
        {[
          item.refereeTitle,
          item.salonName,
          item.relationship && labelFor(ENDORSEMENT_RELATIONSHIPS, item.relationship),
          formatDate(item.writtenAt),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <blockquote className="whitespace-pre-line border-l-2 pl-4 text-sm leading-relaxed">
        {item.body}
      </blockquote>
      {item.contactOk && (
        <p className="text-muted-foreground text-xs">
          Happy for salons you apply to to contact them.
        </p>
      )}
      <div className="flex gap-2">
        {item.status === "shown" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => show(false)}>
            Hide
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => show(true)}>
            Show on my profile
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await removeOne(item.id);
              return "Deleted";
            })
          }
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

function Waiting({ item }: { item: Item }) {
  const { pending, run } = useItemAction();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
      <span>
        <span className="font-medium">{item.refereeName}</span>{" "}
        <span className="text-muted-foreground">
          {item.refereeEmail} · asked {formatDate(item.createdAt)}
          {item.linkExpiresAt && `, link works until ${formatDate(item.linkExpiresAt)}`}
        </span>
      </span>
      <Button
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(async () => {
            await removeOne(item.id);
            return "Request cancelled";
          })
        }
      >
        Cancel
      </Button>
    </li>
  );
}
