import {
  AU_STATES,
  JOB_ROLES,
  nameChangeExpiresIdentity,
  RIGHT_TO_WORK,
  seekerProfileSchema,
} from "@salonstaff/shared";
import { createFileRoute } from "@tanstack/react-router";
import { SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import { AppLink } from "@/components/app-link";
import {
  CheckboxField,
  CheckboxGroup,
  FormMessage,
  formList,
  formText,
  parse,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useAction,
} from "@/components/form";
import { Notice } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { safeNext } from "@/lib/session";

export const Route = createFileRoute("/account/")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search.next),
  }),
  head: () => privatePage("Your profile"),
  component: Basics,
});

function Basics() {
  const full = useMyProfile();
  const { next } = Route.useSearch();
  const p = full?.profile;
  const idVerified = full?.verification.identity === "verified";
  const refresh = useRefresh();
  const action = useAction();
  const e = action.errors;
  return (
    <div className="space-y-6">
      {next && full && (
        <Notice title="Profile saved">
          <AppLink href={next} className="underline">
            Go back to where you were
          </AppLink>
        </Notice>
      )}
      {!full && (
        <Notice title="Make your profile">
          Start with your name, where you are and the roles you're after. Then add a photo, skills,
          portfolio, experience and endorsements from the list.
        </Notice>
      )}
      <SectionCard
        title="Basics"
        description="Your name, where you are and the roles you're after."
      >
        <form
          className="grid gap-4"
          onSubmit={action.submit(async (form) => {
            const body = parse(seekerProfileSchema, {
              ...formText(form),
              roles: formList(form, "roles"),
              openToWork: form.get("openToWork") === "on",
            });
            // A new name after the ID check means verifying again (D-16).
            const expiresId = idVerified && p && nameChangeExpiresIdentity(p, body);
            if (
              expiresId &&
              !window.confirm(
                `Your ID was checked against the name ${p.firstName} ${p.lastName}. With a new name you'll need to verify your ID again, and salons won't see you as verified until you do. Change it?`,
              )
            ) {
              return;
            }
            unwrap(await api.PUT("/v1/me/profile", { body }));
            await refresh(expiresId ? "Profile saved. Verify your ID again." : "Profile saved");
          })}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="First name"
              name="firstName"
              defaultValue={p?.firstName}
              required
              error={e.firstName}
            />
            <TextField
              label="Last name"
              name="lastName"
              defaultValue={p?.lastName}
              required
              error={e.lastName}
              hint="A shared profile shows only its first letter."
            />
          </div>
          {idVerified && (
            <p className="text-muted-foreground text-sm">
              Your ID is verified with this name. Changing it means verifying your ID again.
            </p>
          )}
          <TextField
            label="Headline"
            name="headline"
            defaultValue={p?.headline ?? ""}
            placeholder="Senior colourist, balayage specialist"
            maxLength={120}
            error={e.headline}
          />
          <TextAreaField
            label="About you"
            name="about"
            rows={4}
            defaultValue={p?.about ?? ""}
            maxLength={2000}
            error={e.about}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Suburb"
              name="suburb"
              defaultValue={p?.suburb}
              required
              error={e.suburb}
            />
            <SelectField
              label="State"
              name="state"
              options={AU_STATES.map((s) => ({ value: s.value, label: s.value }))}
              defaultValue={p?.state ?? ""}
              placeholder="Choose"
              error={e.state}
            />
            <TextField
              label="Postcode"
              name="postcode"
              inputMode="numeric"
              maxLength={4}
              defaultValue={p?.postcode}
              required
              error={e.postcode}
            />
          </div>
          <CheckboxGroup
            label="Roles you're after (up to 6)"
            name="roles"
            options={JOB_ROLES}
            defaultValues={p?.roles ?? []}
            error={e.roles}
          />
          <TextField
            label="Years of experience"
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={p?.yearsExperience ?? 0}
            error={e.yearsExperience}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Instagram (optional)"
              name="instagram"
              defaultValue={p?.instagram ?? ""}
              placeholder="yourhandle"
              error={e.instagram}
            />
            <TextField
              label="TikTok (optional)"
              name="tiktok"
              defaultValue={p?.tiktok ?? ""}
              placeholder="yourhandle"
              error={e.tiktok}
            />
          </div>
          <SelectField
            label="Right to work in Australia"
            name="rightToWork"
            options={RIGHT_TO_WORK}
            defaultValue={p?.rightToWork ?? ""}
            placeholder="Choose"
            error={e.rightToWork}
            hint="Only salons see this, never your share page."
          />
          <CheckboxField
            label="I'm open to work"
            name="openToWork"
            defaultChecked={p?.openToWork ?? true}
          />
          <FormMessage message={action.message} />
          <div>
            <SubmitButton pending={action.pending}>
              {full ? "Save basics" : "Create my profile"}
            </SubmitButton>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
