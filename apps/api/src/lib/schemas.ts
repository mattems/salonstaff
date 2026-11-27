/**
 * Response shapes shared by the `/v1` routes, and small helpers for declaring routes. Field names
 * are camelCase, like the request schemas in `@salonstaff/shared`.
 */
import { z } from "@hono/zod-openapi";
import {
  APPLICATION_STATUS_VALUES,
  AU_STATE_VALUES,
  CONTACT_BY_VALUES,
  EMPLOYMENT_TYPE_VALUES,
  ENDORSEMENT_RELATIONSHIP_VALUES,
  JOB_ROLE_VALUES,
  PAY_PERIOD_VALUES,
  PROFILE_VISIBILITY_VALUES,
  RIGHT_TO_WORK_BASIS_VALUES,
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

/** The `{salonId}` in an employer route (D-11). */
export const SalonParams = z.object({
  salonId: pathParam("salonId", "sln_01k6q2x8h4f7tbn3m9vz5cdr0e"),
});

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
export const RightToWorkBasisSchema = z.enum(RIGHT_TO_WORK_BASIS_VALUES);
export const Timestamp = z
  .string()
  .openapi({ format: "date-time", example: "2026-11-25T03:00:00.000Z" });

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
    rightToWorkBasis: RightToWorkBasisSchema.nullable().openapi({
      description: "Once right to work is verified: the basis staff checked.",
    }),
    rightToWorkCheckedVia: z.string().nullable().openapi({
      example: "VEVO",
      description: "Once right to work is verified: how (`VEVO` for a visa, else `ID document`).",
    }),
  })
  .openapi("Verification");

export const SeekerProfileSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    headline: z.string().nullable(),
    about: z.string().nullable(),
    suburb: z.string(),
    state: AuStateSchema,
    postcode: z.string(),
    roles: z.array(JobRoleSchema),
    yearsExperience: z.number().int(),
    instagram: z.string().nullable(),
    tiktok: z.string().nullable(),
    rightToWork: z.enum(RIGHT_TO_WORK_VALUES),
    openToWork: z.boolean(),
    photoUrl: z.string().nullable(),
    specialties: z.array(z.string()),
    brands: z.array(z.string()),
    availableDays: z.array(z.string()),
    employmentTypes: z.array(EmploymentTypeSchema),
    availableFrom: z.string().nullable(),
    travelKm: z.number().int().nullable(),
    payMin: z
      .number()
      .nullable()
      .openapi({ description: "The least they'd take, per `payPeriod`. Null: not saying." }),
    payPeriod: PayPeriodSchema,
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
    institution: z.string().nullable(),
    year: z.number().int().nullable(),
    verification: z
      .object({
        status: CheckStatusSchema,
        reference: z.string().nullable().openapi({
          description: "The verification ID (`SSV-…`) once passed. Not on share pages.",
        }),
      })
      .nullable()
      .openapi({
        description:
          "The qualification check for this entry (POST /v1/me/checks/qualification with its `id`). Null if none was sent.",
      }),
  })
  .openapi("Education");

export const PortfolioItemSchema = z
  .object({
    id: z.string().openapi({ example: "pfi_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    imageUrl: z.string(),
    caption: z.string().nullable(),
  })
  .openapi("PortfolioItem");

export const EndorsementRelationshipSchema = z.enum(ENDORSEMENT_RELATIONSHIP_VALUES);

export const EndorsementSchema = z
  .object({
    id: z.string().openapi({ example: "end_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    refereeName: z.string(),
    refereeTitle: z.string().nullable().openapi({ example: "Salon owner" }),
    salonName: z.string().nullable().openapi({ description: "Where they worked together." }),
    relationship: EndorsementRelationshipSchema.nullable(),
    body: z.string(),
    writtenAt: Timestamp,
    onSalonStaff: z.object({ name: z.string(), path: z.string() }).nullable().openapi({
      description:
        "The salon whose team the referee is on here, when they wrote it. Their email address proved it.",
    }),
    contact: z.object({ email: z.string(), phone: z.string().nullable() }).nullable().openapi({
      description:
        "How to reach the referee: only for a salon the person applied to, and only if the referee agreed.",
    }),
  })
  .openapi("Endorsement");

export const FullProfileSchema = z
  .object({
    profile: SeekerProfileSchema,
    experience: z.array(ExperienceSchema),
    education: z.array(EducationSchema),
    portfolio: z.array(PortfolioItemSchema),
    endorsements: z.array(EndorsementSchema),
    verification: VerificationSchema,
  })
  .openapi("FullProfile");

export const ProfileVisibilitySchema = z.enum(PROFILE_VISIBILITY_VALUES).openapi({
  description:
    "`public`: salons can find you and your share link works. `salons`: salons can find you. `hidden`: only salons you apply to.",
});
export const ContactBySchema = z.enum(CONTACT_BY_VALUES);

export const ProfileSettingsSchema = z
  .object({
    visibility: ProfileVisibilitySchema,
    contactBy: ContactBySchema,
    shareCode: z.string().nullable().openapi({ example: "k7x2m9qd4h" }),
    sharePath: z.string().nullable().openapi({
      example: "/p/k7x2m9qd4h",
      description: "Your share page on the website. Null unless your profile is public.",
    }),
  })
  .openapi("ProfileSettings");

export const MyProfileSchema = FullProfileSchema.extend({
  settings: ProfileSettingsSchema,
}).openapi("MyProfile");

export const OwnSalonSummarySchema = z
  .object({
    id: z.string().openapi({ example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    path: z.string(),
    status: z.enum(["active", "suspended", "removed"]),
    role: z.enum(["owner", "manager"]).openapi({ description: "Your role on the salon's team." }),
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
    salons: z.array(OwnSalonSummarySchema).openapi({
      description: "The salons you're on the team of, in the order you joined them.",
    }),
    unreadMessages: z.number().int().openapi({
      description:
        "What you haven't seen in your inbox: salons' messages on your applications (GET /v1/me/conversations), and their messages and number views (GET /v1/me/profile/contacts).",
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

/** A job in search results: how far away it is, when the search was near a point. */
export const JobResultSchema = JobSummarySchema.extend({
  distanceKm: z.number().nullable().openapi({
    description: "Kilometres from the point searched near (between suburb centres), or null.",
  }),
}).openapi("JobResult");

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
    unreadMessages: z
      .number()
      .int()
      .openapi({ description: "The salon's messages on it you haven't read (D-17)." }),
  })
  .openapi("MyApplication");

/** One message in the conversation on an application (D-17). */
export const MessageSchema = z
  .object({
    id: z.string().openapi({ example: "msg_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    from: z
      .enum(["salon", "seeker"])
      .openapi({ description: "The salon's team, or the job seeker." }),
    kind: z.enum(["text", "number_viewed"]).openapi({
      description:
        "`text`, or `number_viewed`: a line saying the salon looked at the job seeker's number (no body).",
    }),
    senderName: z
      .string()
      .nullable()
      .openapi({ description: "The writer's first name; null once their account is gone." }),
    body: z.string(),
    about: z
      .object({ applicationId: z.string(), jobTitle: z.string() })
      .nullable()
      .openapi({ description: "The application it's about, if any." }),
    createdAt: Timestamp,
  })
  .openapi("Message");

const SendStateSchema = {
  canSend: z.boolean().openapi({ description: "Whether you can write in it now." }),
  sendHint: z.string().nullable().openapi({
    description:
      "Why not, when you can't (the salon hasn't written yet, they don't take messages).",
  }),
};

export const ConversationApplicationSchema = z
  .object({
    id: z.string().openapi({ example: "app_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    jobId: z.string(),
    jobTitle: z.string(),
    status: ApplicationStatusSchema,
    createdAt: Timestamp,
  })
  .openapi("ConversationApplication");

export const MyConversationSchema = z
  .object({
    id: z.string().openapi({ example: "cnv_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    salon: SalonSummarySchema,
    lastMessage: orNull(MessageSchema),
    lastMessageAt: Timestamp,
    unreadMessages: z
      .number()
      .int()
      .openapi({ description: "The salon's messages you haven't read." }),
    hidden: z.boolean().openapi({ description: "You hid your profile from this salon (D-13)." }),
  })
  .openapi("MyConversation");

export const MyConversationThreadSchema = MyConversationSchema.extend({
  applications: z
    .array(ConversationApplicationSchema)
    .openapi({ description: "Your applications to this salon, newest first." }),
  messages: z.array(MessageSchema),
  ...SendStateSchema,
}).openapi("MyConversationThread");

export const MyApplicationDetailSchema = MyApplicationSchema.extend({
  conversationId: z.string().nullable().openapi({
    description:
      "Your conversation with this salon (GET /v1/me/conversations/{id}), once they've written. `unreadMessages` counts its messages you haven't read.",
  }),
}).openapi("MyApplicationDetail");

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
    role: z.enum(["owner", "manager"]).openapi({
      description:
        "Your role. Managers handle jobs and applicants; owners also change the salon's details, billing and team.",
    }),
  })
  .openapi("MySalon");

export const SalonRoleSchema = z.enum(["owner", "manager"]).openapi("SalonRole");

export const TeamMemberSchema = z
  .object({
    userId: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    email: z.string().nullable(),
    role: SalonRoleSchema,
    joinedAt: Timestamp,
    you: z.boolean(),
  })
  .openapi("TeamMember");

export const TeamInviteSchema = z
  .object({
    id: z.string().openapi({ example: "inv_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    email: z.string(),
    role: SalonRoleSchema,
    expiresAt: Timestamp,
    createdAt: Timestamp,
  })
  .openapi("TeamInvite");

export const TeamSchema = z
  .object({
    members: z.array(TeamMemberSchema).openapi({ description: "Owners first." }),
    invites: z.array(TeamInviteSchema).openapi({ description: "Sent and not yet accepted." }),
  })
  .openapi("Team");

export const SalonJobSchema = JobDetailSchema.extend({
  status: z
    .enum(["draft", "published", "expired", "closed"])
    .openapi({ description: "`expired`: published, but its 30 days are up." }),
  paidVia: z.string().nullable(),
  applicants: z.number().int(),
  newApplicants: z.number().int(),
  notifyUserIds: z.array(z.string()).nullable().openapi({
    description:
      "Who on the team is emailed about new applications. Null: everyone, including people who join later.",
  }),
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

/** An applicant as the salon's team sees them in its list, with the job and the conversation. */
export const SalonApplicantSchema = ApplicantSchema.extend({
  job: z.object({
    id: z.string(),
    title: z.string(),
    path: z.string(),
    status: z.enum(["draft", "published", "closed"]),
  }),
  unreadMessages: z
    .number()
    .int()
    .openapi({ description: "Their messages your team hasn't read (D-17)." }),
  lastMessageAt: Timestamp.nullable(),
}).openapi("SalonApplicant");

export const SalonApplicantsSchema = z
  .object({
    items: z.array(SalonApplicantSchema),
    counts: z
      .record(ApplicationStatusSchema, z.number().int())
      .openapi({ description: "How many of each status match the other filters." }),
    total: z.number().int().openapi({ description: "How many match, whatever their status." }),
    truncated: z
      .boolean()
      .openapi({ description: "More match than were returned: narrow the filters." }),
  })
  .openapi("SalonApplicants");

export const SalonConversationSummarySchema = z
  .object({
    candidateId: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    lastMessage: orNull(MessageSchema),
    lastMessageAt: Timestamp,
    unreadMessages: z
      .number()
      .int()
      .openapi({ description: "Their messages your team hasn't read." }),
  })
  .openapi("SalonConversationSummary");

export const CandidateConversationSchema = z
  .object({
    candidateId: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    applications: z
      .array(ConversationApplicationSchema)
      .openapi({ description: "Their applications to your salon, newest first." }),
    messages: z.array(MessageSchema),
    ...SendStateSchema,
  })
  .openapi("CandidateConversation");

export const ContactOptionsSchema = z
  .object({
    message: z.boolean().openapi({
      description:
        "You can write to them in your conversation (POST …/candidates/{userId}/messages, D-19).",
    }),
    phone: z
      .boolean()
      .openapi({ description: "You can see their mobile (POST …/candidates/{userId}/phone)." }),
  })
  .openapi("ContactOptions");

export const CandidateSchema = FullProfileSchema.extend({
  id: z.string().openapi({ example: "usr_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
  contact: ContactOptionsSchema,
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

/** A profile through its share link (D-13): first name and last initial, no contact details. */
export const SharedProfileSchema = z
  .object({
    name: z.string().openapi({ example: "Jess D." }),
    profile: SeekerProfileSchema.omit({
      lastName: true,
      postcode: true,
      rightToWork: true,
      payMin: true,
      payPeriod: true,
    }),
    experience: z.array(ExperienceSchema),
    education: z.array(EducationSchema),
    portfolio: z.array(PortfolioItemSchema),
    endorsements: z.array(EndorsementSchema),
    verification: VerificationSchema.pick({
      identity: true,
      rightToWork: true,
      qualification: true,
      level: true,
      rightToWorkBasis: true,
      rightToWorkCheckedVia: true,
    }),
    viewer: z
      .object({
        salons: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            candidateId: z.string().openapi({ description: "Their ID in your salon's routes." }),
            contact: ContactOptionsSchema,
          }),
        ),
      })
      .nullable()
      .openapi({
        description:
          "For someone signed in on a salon's team: each salon they can contact this person as. Null for anyone else.",
      }),
  })
  .openapi("SharedProfile");

// ---------------------------------------------------------------------------
// The directory
// ---------------------------------------------------------------------------

export const DirectorySalonSchema = SalonSummarySchema.extend({
  suburbSlug: z.string(),
  about: z.string().nullable(),
  liveJobs: z.number().int(),
  distanceKm: z.number().nullable().openapi({
    description: "Kilometres from the point searched near (between suburb centres), or null.",
  }),
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
