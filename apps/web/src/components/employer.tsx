/** Pieces of the salon's pages: the salon and job forms, status banners, what they can publish. */
import {
  AU_STATES,
  EMPLOYMENT_TYPES,
  formatAbn,
  JOB_ROLES,
  jobInputSchema,
  PAY_PERIODS,
  salonSchema,
} from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { z } from "zod";
import type { Schemas } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Me } from "@/lib/session";
import { AppLink } from "./app-link";
import {
  CheckboxField,
  type FieldErrors,
  formText,
  parse,
  SelectField,
  TextAreaField,
  TextField,
} from "./form";
import { Notice } from "./page";

type Salon = Schemas["MySalon"];

/** For loaders under /employer: someone without a salon starts with onboarding. */
export function requireOwnSalon(me: Me) {
  if (!me.salon) throw redirect({ to: "/employer/onboarding" });
  return me.salon;
}

export function SalonStatusBanner({ salon }: { salon: Pick<Salon, "status" | "statusReason"> }) {
  if (salon.status === "active") return null;
  return (
    <Notice
      tone="destructive"
      title={
        salon.status === "suspended" ? "Your salon is suspended" : "Your salon has been removed"
      }
    >
      {salon.statusReason && <p>{salon.statusReason}</p>}
      <p>
        Your jobs aren't shown and you can't publish new ones. Contact support@salonstaff.com.au to
        sort it out.
      </p>
    </Notice>
  );
}

/** How the salon can publish right now (D-05). */
export function EntitlementSummary({
  entitlement,
  freeUntil,
  listingCredits,
}: {
  entitlement: Schemas["Entitlement"];
  freeUntil: string | null;
  listingCredits: number;
}): ReactNode {
  if (entitlement.via === "free_period") {
    return `Free listings until ${formatDate(freeUntil)}.`;
  }
  if (entitlement.via === "subscription") return "Unlimited listings on the Salon Plan.";
  if (entitlement.via === "credit") {
    return `${listingCredits} listing credit${listingCredits === 1 ? "" : "s"} left.`;
  }
  if (entitlement.reason === "suspended") return "You can't publish while the salon is suspended.";
  return (
    <>
      Your free period has ended. To publish a job,{" "}
      <AppLink href="/employer/billing" className="underline">
        buy a listing or start the Salon Plan
      </AppLink>
      .
    </>
  );
}

const ABN_STATUS: Record<string, string> = {
  verified: "ABN checked",
  pending: "ABN being checked",
  failed: "ABN not verified",
  not_started: "ABN not checked",
  requires_input: "ABN needs attention",
};

export function AbnBadge({ salon }: { salon: Pick<Salon, "abn" | "abnStatus" | "abnEntityName"> }) {
  if (!salon.abn) return null;
  return (
    <Badge variant={salon.abnStatus === "verified" ? "secondary" : "outline"}>
      {ABN_STATUS[salon.abnStatus] ?? salon.abnStatus}: {formatAbn(salon.abn)}
      {salon.abnEntityName && ` (${salon.abnEntityName})`}
    </Badge>
  );
}

const STATE_OPTIONS = AU_STATES.map((state) => ({ value: state.value, label: state.value }));

export const readSalonForm = (form: FormData): z.output<typeof salonSchema> =>
  parse(salonSchema, formText(form));

export function SalonFields({
  salon,
  errors: e,
}: {
  salon?: Partial<Salon> | undefined;
  errors: FieldErrors;
}) {
  return (
    <div className="grid gap-4">
      <TextField
        label="Salon name"
        name="name"
        defaultValue={salon?.name}
        required
        error={e.name}
      />
      <TextField
        label="ABN"
        name="abn"
        inputMode="numeric"
        defaultValue={salon?.abn ?? ""}
        required
        hint="11 digits. We check it on the Australian Business Register."
        error={e.abn}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Contact name"
          name="contactName"
          defaultValue={salon?.contactName ?? ""}
          required
          error={e.contactName}
        />
        <TextField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={salon?.phone ?? ""}
          required
          error={e.phone}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Suburb"
          name="suburb"
          defaultValue={salon?.suburb}
          required
          error={e.suburb}
        />
        <SelectField
          label="State"
          name="state"
          options={STATE_OPTIONS}
          defaultValue={salon?.state ?? ""}
          placeholder="Choose"
          error={e.state}
        />
        <TextField
          label="Postcode"
          name="postcode"
          inputMode="numeric"
          maxLength={4}
          defaultValue={salon?.postcode}
          required
          error={e.postcode}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Website"
          name="website"
          type="url"
          defaultValue={salon?.website ?? ""}
          placeholder="https://"
          error={e.website}
        />
        <TextField
          label="Instagram"
          name="instagram"
          defaultValue={salon?.instagram ?? ""}
          placeholder="yoursalon"
          error={e.instagram}
        />
      </div>
      <TextAreaField
        label="About the salon"
        name="about"
        rows={4}
        maxLength={2000}
        defaultValue={salon?.about ?? ""}
        error={e.about}
      />
    </div>
  );
}

export const readJobForm = (form: FormData): z.output<typeof jobInputSchema> =>
  parse(jobInputSchema, {
    ...formText(form),
    requireQualification: form.get("requireQualification") === "on",
  });

export function JobFields({
  job,
  salon,
  errors: e,
}: {
  job?: Schemas["SalonJob"] | undefined;
  /** New jobs start at the salon's own address. */
  salon?: Pick<Salon, "suburb" | "state" | "postcode"> | undefined;
  errors: FieldErrors;
}) {
  return (
    <div className="grid gap-4">
      <TextField
        label="Job title"
        name="title"
        defaultValue={job?.title}
        placeholder="Senior colourist"
        required
        error={e.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Role"
          name="role"
          options={JOB_ROLES}
          defaultValue={job?.role ?? ""}
          placeholder="Choose"
          error={e.role}
        />
        <SelectField
          label="Employment type"
          name="employmentType"
          options={EMPLOYMENT_TYPES}
          defaultValue={job?.employmentType ?? ""}
          placeholder="Choose"
          error={e.employmentType}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Pay from ($)"
          name="payMin"
          type="number"
          min={0}
          step="0.01"
          defaultValue={job?.payMin ?? ""}
          error={e.payMin}
        />
        <TextField
          label="Pay to ($)"
          name="payMax"
          type="number"
          min={0}
          step="0.01"
          defaultValue={job?.payMax ?? ""}
          error={e.payMax}
        />
        <SelectField
          label="Per"
          name="payPeriod"
          options={PAY_PERIODS}
          defaultValue={job?.payPeriod ?? "hour"}
          error={e.payPeriod}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Suburb"
          name="suburb"
          defaultValue={job?.suburb ?? salon?.suburb}
          required
          error={e.suburb}
        />
        <SelectField
          label="State"
          name="state"
          options={STATE_OPTIONS}
          defaultValue={job?.state ?? salon?.state ?? ""}
          placeholder="Choose"
          error={e.state}
        />
        <TextField
          label="Postcode"
          name="postcode"
          inputMode="numeric"
          maxLength={4}
          defaultValue={job?.postcode ?? salon?.postcode}
          required
          error={e.postcode}
        />
      </div>
      <TextAreaField
        label="About the role"
        name="description"
        rows={8}
        maxLength={8000}
        defaultValue={job?.description}
        hint="What the job is, the salon, the team, hours and perks. At least 40 characters."
        error={e.description}
      />
      <TextAreaField
        label="What you need (optional)"
        name="requirements"
        rows={4}
        maxLength={3000}
        defaultValue={job?.requirements ?? ""}
        error={e.requirements}
      />
      <CheckboxField
        label="Applicants need a verified qualification"
        name="requireQualification"
        defaultChecked={job?.requireQualification ?? false}
      />
    </div>
  );
}
