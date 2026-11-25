import { z } from "zod";
import {
  APPLICATION_STATUS_VALUES,
  AU_STATE_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  JOB_ROLE_VALUES,
  PAY_PERIOD_VALUES,
  PROFILE_LIMITS,
  RIGHT_TO_WORK_VALUES,
  WEEKDAY_VALUES,
} from "./constants";

// Friendlier messages for missing values than Zod's defaults ("expected string, received undefined").
z.config({
  customError: (issue) => {
    if (issue.input === undefined || issue.input === "" || Number.isNaN(issue.input))
      return "Required";
    if (issue.code === "invalid_value") return "Choose an option";
    return undefined;
  },
});

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** A blank form field ("", null, NaN) counts as left out. */
const blankToUndefined = (value: unknown) =>
  value === "" || value === null || (typeof value === "number" && Number.isNaN(value))
    ? undefined
    : value;

/**
 * An optional number that may arrive as a form string. A blank is left out; anything else must
 * be valid. (Not `.catch()`, which would hide mistakes and can't be described in OpenAPI.)
 */
const optionalNumber = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

export const postcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "Enter a 4-digit postcode");

// ---------- Auth ----------

/** Normalises an Australian mobile (04xx xxx xxx, +614…, 614…) to E.164 (+614xxxxxxxx), or null. */
export function normaliseAuMobile(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+?61|0)(4\d{8})$/);
  return m ? `+61${m[1]}` : null;
}

const emailField = z.email("Enter a valid email").trim().toLowerCase();
const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normaliseAuMobile(v);
    if (!n)
      ctx.addIssue({ code: "custom", message: "Enter an Australian mobile number (04xx xxx xxx)" });
    return n ?? v;
  });

/** Sign in or sign up with a one-time code sent to an email address OR a mobile number. */
export const requestCodeSchema = z
  .object({
    email: emailField.optional(),
    phone: phoneField.optional(),
    /** Which side of the market is signing up. Ignored for existing accounts. */
    role: z.enum(["seeker", "employer"]).default("seeker"),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: "Enter an email or a mobile number",
    path: ["email"],
  });
export type RequestCodeInput = z.infer<typeof requestCodeSchema>;

export const verifyCodeSchema = z
  .object({
    email: emailField.optional(),
    phone: phoneField.optional(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code"),
    /** Mobile clients receive a bearer token instead of a cookie. */
    client: z.enum(["web", "mobile"]).default("web"),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: "Enter an email or a mobile number",
    path: ["email"],
  });
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

/** Native Google / Apple sign-in from the mobile app: the app sends the provider's ID token. */
export const oauthTokenSchema = z.object({
  provider: z.enum(["google", "apple"]),
  idToken: z.string().min(10).max(8000),
  /** Apple only returns the name on the very first sign-in, so the app passes it along. */
  name: z.string().trim().max(120).optional(),
  role: z.enum(["seeker", "employer"]).default("seeker"),
});
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;

// ---------- Job seeker ----------
export const seekerProfileSchema = z.object({
  firstName: trimmed(60).min(1, "Required"),
  lastName: trimmed(60).min(1, "Required"),
  /** Any common AU mobile format; stored as +614xxxxxxxx. */
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const n = normaliseAuMobile(v);
      if (!n) ctx.addIssue({ code: "custom", message: "Enter an Australian mobile number" });
      return n ?? v;
    }),
  headline: optionalText(120),
  about: optionalText(2000),
  suburb: trimmed(80).min(1, "Required"),
  state: z.enum(AU_STATE_VALUES),
  postcode: postcodeSchema,
  roles: z.array(z.enum(JOB_ROLE_VALUES)).min(1, "Pick at least one role").max(6),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  qualifications: optionalText(500),
  instagram: optionalText(60),
  rightToWork: z.enum(RIGHT_TO_WORK_VALUES),
  openToWork: z.boolean().default(true),
});
export type SeekerProfileInput = z.infer<typeof seekerProfileSchema>;

export const rightToWorkSchema = z.object({
  basis: z.enum(["citizen", "permanent_resident", "visa"]),
  visaGrantNumber: z.string().trim().max(20).optional(),
  passportCountry: z.string().trim().max(60).optional(),
});
export type RightToWorkInput = z.infer<typeof rightToWorkSchema>;

const tag = z.string().trim().min(1).max(40);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

/** Skills & availability section of the profile. */
export const profileDetailsSchema = z.object({
  specialties: z.array(tag).max(PROFILE_LIMITS.specialties).default([]),
  brands: z.array(tag).max(PROFILE_LIMITS.brands).default([]),
  availableDays: z.array(z.enum(WEEKDAY_VALUES)).default([]),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPE_VALUES)).default([]),
  availableFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  travelKm: optionalNumber(z.coerce.number().int().min(0).max(500)),
  payExpectation: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || undefined),
});
export type ProfileDetailsInput = z.infer<typeof profileDetailsSchema>;

export const experienceSchema = z
  .object({
    salonName: z.string().trim().min(1, "Required").max(120),
    title: z.string().trim().min(1, "Required").max(120),
    location: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => v || undefined),
    startMonth: month,
    endMonth: month.optional().or(z.literal("").transform(() => undefined)),
    description: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((v) => !v.endMonth || v.endMonth >= v.startMonth, {
    message: "End must be after start",
    path: ["endMonth"],
  });
export type ExperienceInput = z.infer<typeof experienceSchema>;

export const educationSchema = z.object({
  qualification: z.string().trim().min(1, "Required").max(120),
  institution: z.string().trim().min(1, "Required").max(120),
  year: optionalNumber(z.coerce.number().int().min(1960).max(2100)),
});
export type EducationInput = z.infer<typeof educationSchema>;

export const applySchema = z.object({
  coverNote: optionalText(1500),
});
export type ApplyInput = z.infer<typeof applySchema>;

// ---------- Job feed ----------
export const jobFiltersSchema = z.object({
  q: optionalText(100),
  role: z.enum(JOB_ROLE_VALUES).optional().catch(undefined),
  state: z.enum(AU_STATE_VALUES).optional().catch(undefined),
  type: z.enum(EMPLOYMENT_TYPE_VALUES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});
export type JobFilters = z.infer<typeof jobFiltersSchema>;

// ---------- Employer ----------
export const salonSchema = z.object({
  name: trimmed(120).min(2, "Required"),
  abn: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{11}$/, "ABN must be 11 digits")),
  contactName: trimmed(120).min(1, "Required"),
  phone: trimmed(20).min(8, "Required"),
  website: optionalText(200),
  instagram: optionalText(60),
  suburb: trimmed(80).min(1, "Required"),
  state: z.enum(AU_STATE_VALUES),
  postcode: postcodeSchema,
  about: optionalText(2000),
});
export type SalonInput = z.infer<typeof salonSchema>;

/** Optional text that a change can clear: blank or null means "remove it", left out means "keep it". */
const clearableText = (max: number) =>
  trimmed(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

/** Changing a salon: send only what changes. A blank website, Instagram or about clears it. */
export const salonUpdateSchema = salonSchema.partial().extend({
  website: clearableText(200),
  instagram: clearableText(60),
  about: clearableText(2000),
});
export type SalonUpdate = z.infer<typeof salonUpdateSchema>;

export const jobInputSchema = z
  .object({
    title: trimmed(120).min(4, "Add a job title"),
    role: z.enum(JOB_ROLE_VALUES),
    employmentType: z.enum(EMPLOYMENT_TYPE_VALUES),
    payMin: optionalNumber(z.coerce.number().min(0).max(500000)),
    payMax: optionalNumber(z.coerce.number().min(0).max(500000)),
    payPeriod: z.enum(PAY_PERIOD_VALUES).default("hour"),
    suburb: trimmed(80).min(1, "Required"),
    state: z.enum(AU_STATE_VALUES),
    postcode: postcodeSchema,
    description: trimmed(8000).min(40, "Describe the role (at least 40 characters)"),
    requirements: optionalText(3000),
    requireQualification: z.boolean().default(false),
  })
  .refine((v) => !v.payMin || !v.payMax || v.payMax >= v.payMin, {
    message: "Max pay must be at least min pay",
    path: ["payMax"],
  });
export type JobInput = z.infer<typeof jobInputSchema>;

export const applicationStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUS_VALUES),
});
