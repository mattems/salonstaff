// Shared constants for Salon Staff — used by the web app, the API and the mobile app.

export const AU_STATES = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
] as const;
export type AuState = (typeof AU_STATES)[number]["value"];
export const AU_STATE_VALUES = AU_STATES.map((s) => s.value) as [AuState, ...AuState[]];

export const JOB_ROLES = [
  { value: "senior_stylist", label: "Senior Stylist", group: "hair" },
  { value: "stylist", label: "Hairdresser / Stylist", group: "hair" },
  { value: "junior_stylist", label: "Junior Stylist", group: "hair" },
  { value: "apprentice_hair", label: "Apprentice Hairdresser", group: "hair" },
  { value: "colourist", label: "Colourist", group: "hair" },
  { value: "barber", label: "Barber", group: "hair" },
  { value: "beauty_therapist", label: "Beauty Therapist", group: "beauty" },
  { value: "nail_technician", label: "Nail Technician", group: "beauty" },
  { value: "lash_brow", label: "Lash & Brow Technician", group: "beauty" },
  { value: "makeup_artist", label: "Makeup Artist", group: "beauty" },
  { value: "skin_therapist", label: "Skin / Dermal Therapist", group: "beauty" },
  { value: "massage_spa", label: "Massage & Spa Therapist", group: "beauty" },
  { value: "apprentice_beauty", label: "Apprentice / Trainee Beauty", group: "beauty" },
  { value: "salon_manager", label: "Salon Manager", group: "salon" },
  { value: "receptionist", label: "Salon Coordinator / Reception", group: "salon" },
  { value: "educator", label: "Educator / Trainer", group: "salon" },
] as const;
export type JobRole = (typeof JOB_ROLES)[number]["value"];
export const JOB_ROLE_VALUES = JOB_ROLES.map((r) => r.value) as [JobRole, ...JobRole[]];

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "casual", label: "Casual" },
  { value: "contract", label: "Contract" },
  { value: "apprenticeship", label: "Apprenticeship" },
  { value: "chair_rental", label: "Chair / room rental" },
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]["value"];
export const EMPLOYMENT_TYPE_VALUES = EMPLOYMENT_TYPES.map((t) => t.value) as [
  EmploymentType,
  ...EmploymentType[],
];

export const PAY_PERIODS = [
  { value: "hour", label: "per hour" },
  { value: "week", label: "per week" },
  { value: "year", label: "per year" },
] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number]["value"];
export const PAY_PERIOD_VALUES = PAY_PERIODS.map((p) => p.value) as [PayPeriod, ...PayPeriod[]];

/** How a passed right-to-work check found they may work (D-03): the basis staff checked. */
export const RIGHT_TO_WORK_BASES = [
  { value: "citizen", label: "Citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "visa", label: "Visa" },
] as const;
export type RightToWorkBasis = (typeof RIGHT_TO_WORK_BASES)[number]["value"];
export const RIGHT_TO_WORK_BASIS_VALUES = RIGHT_TO_WORK_BASES.map((b) => b.value) as [
  RightToWorkBasis,
  ...RightToWorkBasis[],
];

export const RIGHT_TO_WORK = [
  { value: "citizen", label: "Australian or NZ citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "visa_full", label: "Visa with full work rights" },
  { value: "visa_limited", label: "Visa with limited work rights" },
  { value: "needs_sponsorship", label: "Need sponsorship" },
] as const;
export type RightToWork = (typeof RIGHT_TO_WORK)[number]["value"];
export const RIGHT_TO_WORK_VALUES = RIGHT_TO_WORK.map((r) => r.value) as [
  RightToWork,
  ...RightToWork[],
];

export const APPLICATION_STATUSES = [
  { value: "submitted", label: "Submitted" },
  { value: "viewed", label: "Viewed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "interview", label: "Interview" },
  { value: "hired", label: "Hired" },
  { value: "declined", label: "Not progressing" },
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]["value"];
export const APPLICATION_STATUS_VALUES = APPLICATION_STATUSES.map((s) => s.value) as [
  ApplicationStatus,
  ...ApplicationStatus[],
];

export const VERIFICATION_STATUSES = [
  "not_started",
  "pending",
  "requires_input",
  "verified",
  "failed",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Kinds of checks a person or business can pass. */
export const VERIFICATION_KINDS = ["identity", "right_to_work", "qualification", "abn"] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

/** Pricing in Australian cents (GST inclusive). */
export const PRICING = {
  singleListingCents: 4900,
  salonPlanMonthlyCents: 9900,
  foundingPlanMonthlyCents: 6900,
  featuredAddonCents: 2900,
  freePeriodDays: 90,
  listingDurationDays: 30,
  /** Founding offer only applies to the first N salons. */
  foundingSalonLimit: 200,
} as const;

/** Anti-bot / anti-spam limits for job seekers. */
export const LIMITS = {
  applicationsPerDay: 20,
  otpRequestsPerHour: 5,
  otpMaxAttempts: 5,
  otpTtlMinutes: 10,
  sessionDays: 60,
} as const;

export function labelFor<T extends { value: string; label: string }>(
  list: readonly T[],
  value: string | null | undefined,
): string {
  return list.find((i) => i.value === value)?.label ?? value ?? "";
}

export function formatPay(
  min: number | null | undefined,
  max: number | null | undefined,
  period: PayPeriod | null | undefined,
): string | null {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    period === "year"
      ? `$${Math.round(n / 1000)}k`
      : `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
  const per = labelFor(PAY_PERIODS, period ?? "hour");
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)} ${per}`;
  return `${fmt(min ?? max ?? 0)} ${per}`;
}

/** Specialty tags job seekers pick from (they can also add their own). */
export const SPECIALTIES = [
  {
    group: "Colour",
    items: [
      "Balayage",
      "Foils",
      "Blonding",
      "Colour correction",
      "Vivids",
      "Grey blending",
      "Toning",
    ],
  },
  {
    group: "Cutting & styling",
    items: [
      "Precision cutting",
      "Layered cuts",
      "Curly cuts",
      "Men's cuts",
      "Bridal & updos",
      "Blow-dry styling",
    ],
  },
  {
    group: "Barbering",
    items: ["Skin fades", "Beard sculpting", "Hot towel shaves", "Scissor-over-comb"],
  },
  { group: "Treatments", items: ["Extensions", "Keratin smoothing", "Perms", "Scalp treatments"] },
  {
    group: "Brows & lashes",
    items: [
      "Brow lamination",
      "Brow shaping",
      "Henna brows",
      "Lash lift",
      "Classic lashes",
      "Volume lashes",
    ],
  },
  { group: "Nails", items: ["Gel", "BIAB", "Acrylics", "Nail art", "Pedicures"] },
  {
    group: "Skin & body",
    items: ["Facials", "Skin needling", "Chemical peels", "LED", "Waxing", "Spray tan", "Massage"],
  },
  { group: "Makeup", items: ["Bridal makeup", "Editorial makeup", "Special effects"] },
  {
    group: "Salon",
    items: ["Reception", "Retail", "Social media", "Team leadership", "Education"],
  },
] as const;

export const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;
export type Weekday = (typeof WEEKDAYS)[number]["value"];
export const WEEKDAY_VALUES = WEEKDAYS.map((d) => d.value) as [Weekday, ...Weekday[]];

export const PROFILE_LIMITS = {
  portfolio: 24,
  specialties: 20,
  brands: 15,
  experience: 15,
  education: 10,
  /** Endorsements shown on a profile at once. */
  endorsements: 5,
  /** Endorsements asked for and not yet written. */
  endorsementRequests: 10,
} as const;

/** Who can see a job seeker's profile (D-13). */
export const PROFILE_VISIBILITY = [
  {
    value: "public",
    label: "Public",
    description: "Salons can find you, and anyone with your share link can see your profile.",
  },
  {
    value: "salons",
    label: "Salons only",
    description: "Salons on Salon Staff can find you. Your share link is off.",
  },
  {
    value: "hidden",
    label: "Hidden",
    description: "Only salons you apply to can see your profile.",
  },
] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY)[number]["value"];
export const PROFILE_VISIBILITY_VALUES = PROFILE_VISIBILITY.map((v) => v.value) as [
  ProfileVisibility,
  ...ProfileVisibility[],
];

/** How salons may contact a job seeker (D-13). */
export const CONTACT_BY = [
  { value: "both", label: "Email and phone" },
  { value: "email", label: "Email only" },
  { value: "phone", label: "Phone only" },
] as const;
export type ContactBy = (typeof CONTACT_BY)[number]["value"];
export const CONTACT_BY_VALUES = CONTACT_BY.map((v) => v.value) as [ContactBy, ...ContactBy[]];

/** How a referee knows the job seeker. */
export const ENDORSEMENT_RELATIONSHIPS = [
  { value: "managed", label: "Managed them" },
  { value: "worked_with", label: "Worked with them" },
  { value: "trained", label: "Trained or taught them" },
  { value: "client", label: "Was their client" },
] as const;
export type EndorsementRelationship = (typeof ENDORSEMENT_RELATIONSHIPS)[number]["value"];
export const ENDORSEMENT_RELATIONSHIP_VALUES = ENDORSEMENT_RELATIONSHIPS.map((r) => r.value) as [
  EndorsementRelationship,
  ...EndorsementRelationship[],
];

/** Keeping salons' contact with job seekers useful and spam-free (D-13). Per salon, per day. */
export const CONTACT_LIMITS = {
  messagesPerDay: 25,
  phoneRevealsPerDay: 50,
  /** Messages from one salon to the same person. */
  messagesPerPersonPerDay: 1,
  /** Endorsement requests a job seeker can send. */
  endorsementRequestsPerDay: 5,
  endorsementLinkDays: 30,
} as const;
