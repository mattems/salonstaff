import { PROFILE_LIMITS, profileDetailsSchema, SPECIALTIES } from "@salonstaff/shared";
import { createFileRoute } from "@tanstack/react-router";
import { NeedsProfile, SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import {
  CheckboxGroup,
  FormMessage,
  formList,
  formText,
  parse,
  SubmitButton,
  splitList,
  TextField,
  useAction,
} from "@/components/form";
import { currentDetails } from "@/components/profile-details";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/skills")({
  head: () => privatePage("Your skills"),
  component: Skills,
});

const ALL_SPECIALTIES: string[] = SPECIALTIES.flatMap((group) => [...group.items]);

function Skills() {
  const full = useMyProfile();
  const refresh = useRefresh();
  const action = useAction();
  if (!full) return <NeedsProfile />;
  const p = full.profile;
  const custom = p.specialties.filter((s) => !ALL_SPECIALTIES.includes(s));
  return (
    <SectionCard
      title="Skills"
      description={`What you're best at, up to ${PROFILE_LIMITS.specialties}, and the brands you're trained in.`}
    >
      <form
        className="grid gap-5"
        onSubmit={action.submit(async (form) => {
          const text = formText(form);
          const body = parse(profileDetailsSchema, {
            ...currentDetails(p),
            specialties: [...formList(form, "specialties"), ...splitList(text.otherSpecialties)],
            brands: splitList(text.brands),
          });
          unwrap(await api.PUT("/v1/me/profile/details", { body }));
          await refresh("Skills saved");
        })}
      >
        {SPECIALTIES.map((group) => (
          <CheckboxGroup
            key={group.group}
            label={group.group}
            name="specialties"
            options={group.items.map((item) => ({ value: item, label: item }))}
            defaultValues={p.specialties}
            columns={2}
          />
        ))}
        <TextField
          label="Other specialties"
          name="otherSpecialties"
          defaultValue={custom.join(", ")}
          hint="Separate them with commas."
          error={action.errors.specialties}
        />
        <TextField
          label="Brands and products you're trained in"
          name="brands"
          defaultValue={p.brands.join(", ")}
          hint="Separate them with commas."
          error={action.errors.brands}
        />
        <FormMessage message={action.message} />
        <div>
          <SubmitButton pending={action.pending}>Save skills</SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}
