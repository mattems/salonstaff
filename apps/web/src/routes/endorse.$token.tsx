import { BRAND, ENDORSEMENT_RELATIONSHIPS, endorsementSchema } from "@salonstaff/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@salonstaff/ui/components/avatar";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckboxField,
  FormMessage,
  formText,
  parse,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useAction,
} from "@/components/form";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { api, orNull, unwrap } from "@/lib/api";
import { initials } from "@/lib/format";
import { privatePage } from "@/lib/seo";

/** A referee writes an endorsement from the link in their email (D-13). No account needed. */
export const Route = createFileRoute("/endorse/$token")({
  loader: async ({ params }) => ({
    ask: orNull(
      await api.GET("/v1/endorsements/{token}", { params: { path: { token: params.token } } }),
    ),
  }),
  head: () => privatePage("Write an endorsement"),
  component: Endorse,
});

function Endorse() {
  const { ask } = Route.useLoaderData();
  const { token } = Route.useParams();
  const action = useAction();
  const [done, setDone] = useState(false);
  const e = action.errors;

  if (done || !ask) {
    return (
      <Page width="narrow">
        <EmptyState
          title={done ? "Thank you" : "This link has expired or was already used"}
          description={
            done
              ? `${ask?.name ?? "They"} will see what you wrote and choose whether to show it on their ${BRAND.name} profile.`
              : "Ask the person to send you a new one."
          }
        />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        title={`Endorse ${ask.name}`}
        description="A few honest words about working with them. Salons looking to hire will read it."
      />
      <div className="mb-6 flex items-center gap-4 rounded-lg border p-4">
        <Avatar className="size-14">
          {ask.photoUrl && <AvatarImage src={ask.photoUrl} alt={ask.name} />}
          <AvatarFallback>{initials(ask.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium">{ask.name}</p>
          {ask.headline && <p className="text-muted-foreground text-sm">{ask.headline}</p>}
          {ask.note && <p className="mt-1 text-sm">"{ask.note}"</p>}
        </div>
      </div>
      <form
        className="grid gap-4"
        onSubmit={action.submit(async (form) => {
          const body = parse(endorsementSchema, {
            ...formText(form),
            contactOk: form.get("contactOk") === "on",
          });
          unwrap(await api.POST("/v1/endorsements/{token}", { params: { path: { token } }, body }));
          setDone(true);
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Your name"
            name="name"
            defaultValue={ask.refereeName}
            required
            error={e.name}
          />
          <TextField
            label="Your role"
            name="title"
            placeholder="Salon owner"
            required
            error={e.title}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Where you worked together"
            name="salonName"
            placeholder="Salon name"
            required
            error={e.salonName}
          />
          <SelectField
            label="You…"
            name="relationship"
            options={ENDORSEMENT_RELATIONSHIPS}
            placeholder="Choose"
            error={e.relationship}
          />
        </div>
        <TextAreaField
          label={`What's ${ask.name.split(" ")[0]} like to work with?`}
          name="body"
          rows={6}
          maxLength={1000}
          required
          hint="Their skills, how they are with clients and the team. They can show or hide it, but not change it."
          error={e.body}
        />
        <CheckboxField label="Salons they apply to may contact me about them" name="contactOk" />
        <TextField
          label="Your phone (optional)"
          name="phone"
          type="tel"
          hint="Only for salons they apply to, and only if you tick the box above. Your email goes to them the same way."
          error={e.phone}
        />
        <FormMessage message={action.message} />
        <div>
          <SubmitButton pending={action.pending}>Send endorsement</SubmitButton>
        </div>
        <p className="text-muted-foreground text-xs">
          Your name, role, salon and what you wrote appear on their profile. Your email and phone
          never do.
        </p>
      </form>
    </Page>
  );
}
