/**
 * Response shapes shared by the `/v1` routes, and small helpers for declaring routes. Field names
 * are camelCase, like the request schemas in `@salonstaff/shared`.
 */
import { z } from "@hono/zod-openapi";
import {
  APPLICATION_STATUS_VALUES,
  AU_STATE_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  JOB_ROLE_VALUES,
  PAY_PERIOD_VALUES,
  RIGHT_TO_WORK_VALUES,
  VERIFICATION_STATUSES,
} from "@salonstaff/shared";
import { orNull, problemResponse } from "./openapi";

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

export const jsonBody = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});

export const formBody = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "multipart/form-data": { schema } }, required: true },
});

/** A file field in a multipart form. */
export const FileField = z.instanceof(File).openapi({
  type: "string",
  format: "binary",
  description: "JPG, PNG, WebP or HEIC, 8MB at most.",
});

export const errors = {
  400: problemResponse("The request is not valid"),
  401: problemResponse("Not signed in"),
  403: problemResponse("Not allowed for this account"),
  404: problemResponse("Not found"),
  409: problemResponse("In conflict with the current state"),
};

export const pathParam = (name: string, example: string) =>
  z.string().openapi({ param: { name, in: "path" }, example });

export const Deleted = z.object({ deleted: z.literal(true) }).openapi("Deleted");

export const UrlResponse = z
  .object({ url: z.string().openapi({ description: "Send the person here." }) })
  .openapi("RedirectUrl");

export const pageOf = <T extends z.ZodType>(item: T, name: string) =>
  z
    .object({
      items: z.array(item),
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
      pageCount: z.number().int(),
    })
    .openapi(name);

export const PageQuery = z.coerce
  .number()
  .int()
  .min(1)
  .max(500)
  .default(1)
  .openapi({ description: "1 for the first page.", example: 1 });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const AuStateSchema = z.enum(AU_STATE_VALUES).openapi({ example: "NSW" });
export const JobRoleSchema = z.enum(JOB_ROLE_VALUES).openapi({ example: "colourist" });
export const EmploymentTypeSchema = z.enum(EMPLOYMENT_TYPE_VALUES);
export const PayPeriodSchema = z.enum(PAY_PERIOD_VALUES);
export const ApplicationStatusSchema = z.enum(APPLICATION_STATUS_VALUES);
export const CheckStatusSchema = z.enum(VERIFICATION_STATUSES);
const Timestamp = z.string().openapi({ format: "date-time", example: "2026-11-25T03:00:00.000Z" });

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const VerificationSchema = z
  .object({
    identity: CheckStatusSchema,
    rightToWork: CheckStatusSchema,
    qualification: CheckStatusSchema,
    level: z.number().int().min(0).max(2).openapi({
      description: "0 not verified, 1 ID verified, 2 work-ready (ID and right to work).",
    }),
    references: z
      .object({
        identity: z.string().optional(),
        rightToWork: z.string().optional(),
        qualification: z.string().optional(),
      })
      .openapi({
        description:
          "Verification IDs of passed checks (`SSV-7K3M-9QXA`). Only these are kept, never documents.",
      }),
    nameMatched: z
      .boolean()
      .nullable()
      .openapi({ description: "Whether the name on the ID matched the profile when checked." }),
    identityVerifiedAt: Timestamp.nullable(),
    qualificationTitle: z.string().nullable(),
  })
  .openapi("Verification");

export const SeekerProfileSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().nullable(),
    headline: z.string().nullable(),
    about: z.string().nullable(),
    suburb: z.string(),
    state: AuStateSchema,
    postcode: z.string(),
    roles: z.array(JobRoleSchema),
    yearsExperience: z.number().int(),
    qualifications: z.string().nullable(),
    instagram: z.string().nullable(),
    rightToWork: z.enum(RIGHT_TO_WORK_VALUES),
    openToWork: z.boolean(),
    photoUrl: z.string().nullable(),
    specialties: z.array(z.string()),
    brands: z.array(z.string()),
    availableDays: z.array(z.string()),
    employmentTypes: z.array(EmploymentTypeSchema),
    availableFrom: z.string().nullable(),
    travelKm: z.number().int().nullable(),
    payExpectation: z.string().nullable(),
  })
  .openapi("SeekerProfile");

export const ExperienceSchema = z
  .object({
    id: z.string().openapi({ example: "exp_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    salonName: z.string(),
    title: z.string(),
    location: z.string().nullable(),
    startMonth: z.string().openapi({ example: "2022-03" }),
    endMonth: z.string().nullable(),
    description: z.string().nullable(),
  })
  .openapi("Experience");

export const EducationSchema = z
  .object({
    id: z.string().openapi({ example: "edu_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    qualification: z.string(),
    institution: z.string(),
    year: z.number().int().nullable(),
  })
  .openapi("Education");

export const PortfolioItemSchema = z
  .object({
    id: z.string().openapi({ example: "pfi_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    imageUrl: z.string(),
    caption: z.string().nullable(),
  })
  .openapi("PortfolioItem");

export const FullProfileSchema = z
  .object({
    profile: SeekerProfileSchema,
    experience: z.array(ExperienceSchema),
    education: z.array(EducationSchema),
    portfolio: z.array(PortfolioItemSchema),
    verification: VerificationSchema,
  })
  .openapi("FullProfile");

export const OwnSalonSummarySchema = z
  .object({
    id: z.string().openapi({ example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    path: z.string(),
    status: z.enum(["active", "suspended", "removed"]),
  })
  .openapi("OwnSalonSummary");

export const MeSchema = z
  .object({
    id: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    email: z
      .string()
      .nullable()
      .openapi({ description: "Null for an account made with a mobile number and no email yet." }),
    phoneNumber: z.string().nullable(),
    role: z.enum(["seeker", "employer"]),
    createdAt: Timestamp,
    profile: orNull(SeekerProfileSchema),
    verification: VerificationSchema,
    salon: orNull(OwnSalonSummarySchema).openapi({
      description: "The salon you manage, if any.",
    }),
  })
  .openapi("Me");

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const SalonSummarySchema = z
  .object({
    id: z.string().openapi({ example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    path: z.string().openapi({ example: "/salons/nsw/surry-hills/willow-and-ash-hair" }),
    suburb: z.string(),
    state: AuStateSchema,
    logoUrl: z.string().nullable(),
    verified: z.boolean().openapi({ description: "Claimed, with its ABN checked on the ABR." }),
    claimed: z.boolean(),
  })
  .openapi("SalonSummary");

export const JobSummarySchema = z
  .object({
    id: z.string().openapi({ example: "job_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    slug: z.string(),
    path: z
      .string()
      .openapi({ example: "/jobs/nsw/surry-hills/senior-colourist-willow-and-ash-hair" }),
    title: z.string(),
    role: JobRoleSchema,
    employmentType: EmploymentTypeSchema,
    payMin: z.number().nullable(),
    payMax: z.number().nullable(),
    payPeriod: PayPeriodSchema,
    pay: z.string().nullable().openapi({ example: "$38–$45 per hour" }),
    suburb: z.string(),
    suburbSlug: z.string(),
    state: AuStateSchema,
    postcode: z.string(),
    featured: z.boolean(),
    closed: z
      .boolean()
      .openapi({ description: "Closed or expired: the ad stays up, marked closed." }),
    publishedAt: Timestamp.nullable(),
    expiresAt: Timestamp.nullable(),
    salon: SalonSummarySchema,
  })
  .openapi("JobSummary");

export const JobDetailSchema = JobSummarySchema.extend({
  description: z.string(),
  requirements: z.string().nullable(),
  requireQualification: z.boolean(),
}).openapi("JobDetail");

export const ApplyBlockerSchema = z.enum([
  "login",
  "employer",
  "applied",
  "profile",
  "verify",
  "qualification",
  "closed",
]);

export const ViewerSchema = z
  .object({
    applied: z.boolean(),
    saved: z.boolean(),
    canApply: z.boolean(),
    blocker: ApplyBlockerSchema.nullable().openapi({
      description: "Why you can't apply, so the right next step can be shown.",
    }),
    reason: z.string().nullable(),
  })
  .openapi("JobViewer");

export const JobPageSchema = pageOf(JobSummarySchema, "JobList");

export const BreadcrumbSchema = z
  .object({ name: z.string(), path: z.string() })
  .openapi("Breadcrumb");

export const RedirectSchema = z
  .object({
    kind: z.literal("redirect"),
    redirect: z.string().openapi({ description: "Answer with a 301 to this path." }),
  })
  .openapi("PathRedirect");

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const MyApplicationSchema = z
  .object({
    id: z.string().openapi({ example: "app_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    status: ApplicationStatusSchema,
    coverNote: z.string().nullable(),
    createdAt: Timestamp,
    job: JobSummarySchema,
  })
  .openapi("MyApplication");

// ---------------------------------------------------------------------------
// Salons (owner's view)
// ---------------------------------------------------------------------------

export const EntitlementSchema = z
  .object({
    ok: z.boolean().openapi({ description: "Whether a job can be published right now." }),
    via: z.enum(["free_period", "subscription", "credit"]).nullable(),
    reason: z.enum(["suspended", "needs_listing"]).nullable(),
  })
  .openapi("Entitlement");

export const MySalonSchema = z
  .object({
    id: z.string().openapi({ example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    slug: z.string(),
    path: z.string(),
    abn: z.string().nullable(),
    abnStatus: CheckStatusSchema,
    abnEntityName: z.string().nullable(),
    contactName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    website: z.string().nullable(),
    instagram: z.string().nullable(),
    address: z.string().nullable(),
    suburb: z.string(),
    state: AuStateSchema,
    postcode: z.string(),
    about: z.string().nullable(),
    logoUrl: z.string().nullable(),
    status: z.enum(["active", "suspended", "removed"]),
    statusReason: z.string().nullable(),
    source: z.enum(["owner", "directory"]),
    founding: z.boolean(),
    freeUntil: Timestamp.nullable(),
    listingCredits: z.number().int(),
    claimedAt: Timestamp.nullable(),
    createdAt: Timestamp,
    entitlement: EntitlementSchema,
  })
  .openapi("MySalon");

export const SalonJobSchema = JobDetailSchema.extend({
  status: z
    .enum(["draft", "published", "expired", "closed"])
    .openapi({ description: "`expired`: published, but its 30 days are up." }),
  paidVia: z.string().nullable(),
  applicants: z.number().int(),
  newApplicants: z.number().int(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}).openapi("SalonJob");

export const CandidateSummarySchema = z
  .object({
    id: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    firstName: z.string(),
    lastName: z.string(),
    headline: z.string().nullable(),
    photoUrl: z.string().nullable(),
    suburb: z.string(),
    state: AuStateSchema,
    roles: z.array(JobRoleSchema),
    yearsExperience: z.number().int(),
    rightToWork: z.enum(RIGHT_TO_WORK_VALUES),
  })
  .openapi("CandidateSummary");

export const ApplicantSchema = z
  .object({
    id: z.string().openapi({ example: "app_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    status: ApplicationStatusSchema,
    isNew: z.boolean().openapi({ description: "Not seen before this request." }),
    coverNote: z.string().nullable(),
    createdAt: Timestamp,
    candidateId: z.string(),
    candidate: orNull(CandidateSummarySchema),
    verification: VerificationSchema,
  })
  .openapi("Applicant");

export const ContactSchema = z
  .object({ email: z.string().nullable(), phone: z.string().nullable() })
  .openapi("Contact");

export const CandidateSchema = FullProfileSchema.extend({
  id: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
  contact: ContactSchema,
  applications: z.array(
    z.object({
      id: z.string(),
      jobId: z.string(),
      jobTitle: z.string(),
      status: ApplicationStatusSchema,
      createdAt: Timestamp,
    }),
  ),
}).openapi("Candidate");

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

export const DirectorySalonSchema = SalonSummarySchema.extend({
  suburbSlug: z.string(),
  about: z.string().nullable(),
  liveJobs: z.number().int(),
}).openapi("DirectorySalon");

export const SalonListSchema = pageOf(DirectorySalonSchema, "SalonList");

export const ClaimSchema = z
  .object({
    id: z.string().openapi({ example: "clm_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    salonId: z.string(),
    status: z.enum(["pending_email", "pending_review", "approved", "rejected"]),
    sentTo: z
      .string()
      .nullable()
      .openapi({ description: "Where the confirmation link went, masked (`he•••@salon.com`)." }),
    decisionNote: z.string().nullable(),
    createdAt: Timestamp,
    decidedAt: Timestamp.nullable(),
  })
  .openapi("Claim");
