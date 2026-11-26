import { EMPLOYMENT_TYPES, PAY_PERIODS, profileDetailsSchema, WEEKDAYS } from "@salonstaff/shared";
import { createFileRoute } from "@tanstack/react-router";
import { NeedsProfile, SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import {
  CheckboxGroup,
  FormMessage,
  formList,
  formText,
  parse,
  SelectField,
  SubmitButton,
  TextField,
  useAction,
} from "@/components/form";
import { currentDetails } from "@/components/profile-details";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/availability")({
  head: () => privatePage("Your availability and pay"),
  component: Availability,
});

function Availability() {
  const full = useMyProfile();
  const refresh = useRefresh();
  const action = useAction();
  if (!full) return <NeedsProfile />;
  const p = full.profile;
  const e = action.errors;
  return (
    <SectionCard title="Availability and pay" description="When and how you'd like to work.">
      <form
        className="grid gap-5"
        onSubmit={action.submit(async (form) => {
          const text = formText(form);
          const body = parse(profileDetailsSchema, {
            ...currentDetails(p),
            availableDays: formList(form, "availableDays"),
            employmentTypes: formList(form, "employmentTypes"),
            availableFrom: text.availableFrom ?? "",
            travelKm: text.travelKm,
            payMin: text.payMin,
            payPeriod: text.payPeriod,
          });
          unwrap(await api.PUT("/v1/me/profile/details", { body }));
          await refresh("Availability and pay saved");
        })}
      >
        <CheckboxGroup
          label="Days you can work"
          name="availableDays"
          options={WEEKDAYS}
          defaultValues={p.availableDays}
          columns={4}
        />
        <CheckboxGroup
          label="Work you're after"
          name="employmentTypes"
          options={EMPLOYMENT_TYPES}
          defaultValues={p.employmentTypes}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Can start from"
            name="availableFrom"
            type="date"
            defaultValue={p.availableFrom ?? ""}
            hint="Leave blank for now."
            error={e.availableFrom}
          />
          <TextField
            label="Will travel (km)"
            name="travelKm"
            type="number"
            min={0}
            max={500}
            defaultValue={p.travelKm ?? ""}
            error={e.travelKm}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="font-medium text-sm">The least you'd take</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Amount ($)"
              name="payMin"
              type="number"
              inputMode="decimal"
              min={1}
              step="0.5"
              defaultValue={p.payMin ?? ""}
              placeholder="35"
              error={e.payMin}
            />
            <SelectField
              label="Per"
              name="payPeriod"
              options={PAY_PERIODS.map((x) => ({
                value: x.value,
                label: x.label.replace("per ", ""),
              }))}
              defaultValue={p.payPeriod}
              error={e.payPeriod}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Only salons see this, never your share page. Leave it blank if you'd rather not say.
          </p>
        </fieldset>
        <FormMessage message={action.message} />
        <div>
          <SubmitButton pending={action.pending}>Save availability and pay</SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}
