import {
  type ApplicationStatus,
  type AuState,
  type ContactBy,
  type EmploymentType,
  type EndorsementRelationship,
  type JobRole,
  type NotificationTopic,
  type PayPeriod,
  type ProfileVisibility,
  type RightToWork,
  uuidv7,
  type VerificationStatus,
} from "@salonstaff/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** Primary keys are UUIDv7; the API shows them with a prefix (`encodeId`). */
const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());

/**
 * Stored responses for requests sent with an `Idempotency-Key`, so a retry
 * returns the first result instead of repeating the action. Kept for 24 hours.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    responseContentType: text("response_content_type"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);

// ---------------------------------------------------------------------------
// Authentication. The shape of these four tables is dictated by Better Auth
// (property names must match its field names); see packages/auth.
// ---------------------------------------------------------------------------

export type UserRole = "seeker" | "employer";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  /**
   * Always set: someone who signs up by mobile gets a stand-in address
   * (`…@phone.salonstaff.invalid`, see packages/auth) until they add a real one.
   */
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** E.164, e.g. +61412345678. Kept by the phone-number sign-in plugin. */
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
  role: text("role").$type<UserRole>().notNull().default("seeker"),
  /** Set by staff (a ban). A banned person can't sign in; salons stop seeing their applications. */
  suspendedAt: ts("suspended_at"),
  suspendedReason: text("suspended_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The value in the session cookie, or the bearer token on mobile. */
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/** One row per way a user signs in with another provider (Google, Apple). */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

/** Short-lived, single-use values: email and SMS sign-in codes. */
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

/**
 * A phone that gets push notifications (D-15): one per signed-in app session, so signing out (or the
 * session ending) removes it. The token is Apple's (APNs) device token.
 */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .unique()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").$type<"ios">().notNull(),
    /** A phone has one token; signing in to another account on it moves the token there. */
    token: text("token").notNull().unique(),
    /** Development builds get tokens for Apple's sandbox, which only it accepts. */
    sandbox: boolean("sandbox").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("push_devices_user_id_idx").on(table.userId)],
);

/**
 * What someone chose to hear about (D-15), one row per topic they've set. No row: push and email
 * both on.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").$type<NotificationTopic>().notNull(),
    push: boolean("push").notNull(),
    email: boolean("email").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.topic] })],
);

// ---------------------------------------------------------------------------
// Job seekers
// ---------------------------------------------------------------------------

export const seekerProfiles = pgTable("seeker_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  /** Deprecated (D-13): salons see the account's verified mobile. Never read or written; drop later. */
  phone: text("phone"),
  headline: text("headline"),
  about: text("about"),
  suburb: text("suburb").notNull(),
  state: text("state").$type<AuState>().notNull(),
  postcode: text("postcode").notNull(),
  roles: jsonb("roles").$type<JobRole[]>().notNull().default([]),
  yearsExperience: integer("years_experience").notNull().default(0),
  /** Deprecated: qualifications are education entries now. Never read or written; drop later. */
  qualifications: text("qualifications"),
  instagram: text("instagram"),
  tiktok: text("tiktok"),
  rightToWork: text("right_to_work").$type<RightToWork>().notNull(),
  openToWork: boolean("open_to_work").notNull().default(true),
  /** Who sees the profile (D-13). */
  visibility: text("visibility").$type<ProfileVisibility>().notNull().default("salons"),
  /** How salons may contact them (D-13). */
  contactBy: text("contact_by").$type<ContactBy>().notNull().default("both"),
  /** Their share link's code (`/p/{code}`); works only while public. Made when first needed. */
  shareCode: text("share_code").unique(),
  /** Object in the public media bucket. */
  photoKey: text("photo_key"),
  specialties: jsonb("specialties").$type<string[]>().notNull().default([]),
  brands: jsonb("brands").$type<string[]>().notNull().default([]),
  availableDays: jsonb("available_days").$type<string[]>().notNull().default([]),
  employmentTypes: jsonb("employment_types").$type<EmploymentType[]>().notNull().default([]),
  /** YYYY-MM-DD, or null for "now". */
  availableFrom: text("available_from"),
  travelKm: integer("travel_km"),
  /** Deprecated (D-13): `payMin`/`payPeriod` replace it. Never read or written; drop later. */
  payExpectation: text("pay_expectation"),
  /** The least they'd take, per `payPeriod`; null when they'd rather not say. */
  payMin: doublePrecision("pay_min"),
  payPeriod: text("pay_period").$type<PayPeriod>().notNull().default("hour"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type EndorsementStatus = "requested" | "received" | "shown" | "hidden";

/**
 * Endorsements (D-13). The job seeker asks a referee by email; the referee writes it through a
 * one-time link (only its hash is kept). The job seeker shows or hides it, but can't change it.
 */
export const seekerEndorsements = pgTable(
  "seeker_endorsements",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<EndorsementStatus>().notNull().default("requested"),
    /** Lowercase. One endorsement per referee address. */
    refereeEmail: text("referee_email").notNull(),
    /** As the job seeker typed it, then as the referee signed it. */
    refereeName: text("referee_name").notNull(),
    note: text("note"),
    /** SHA-256 of the link's token; cleared once written. */
    tokenHash: text("token_hash").unique(),
    tokenExpiresAt: ts("token_expires_at"),
    refereeTitle: text("referee_title"),
    salonName: text("salon_name"),
    relationship: text("relationship").$type<EndorsementRelationship>(),
    body: text("body"),
    contactOk: boolean("contact_ok").notNull().default(false),
    refereePhone: text("referee_phone"),
    /** A salon whose team the referee's address is on, when they wrote it. */
    refereeSalonId: uuid("referee_salon_id").references(() => salons.id, { onDelete: "set null" }),
    writtenAt: ts("written_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("seeker_endorsements_user_idx").on(table.userId, table.status),
    uniqueIndex("seeker_endorsements_referee_idx").on(table.userId, table.refereeEmail),
  ],
);

/** Salons a job seeker has hidden their profile from (D-13). Applying there still shows it. */
export const seekerHiddenSalons = pgTable(
  "seeker_hidden_salons",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.salonId] })],
);

export type ProfileContactKind = "message" | "phone";

/**
 * Every message a salon sent a job seeker through us and every time it revealed their number
 * (D-13): for the job seeker to see, for the daily caps, and for spam reports.
 */
export const profileContacts = pgTable(
  "profile_contacts",
  {
    id: id(),
    seekerId: uuid("seeker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    /** Who on the salon's team; null once they've deleted their account. */
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").$type<ProfileContactKind>().notNull(),
    message: text("message"),
    /** When the job seeker saw it in their inbox; null while unread. */
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("profile_contacts_seeker_idx").on(table.seekerId, table.createdAt),
    index("profile_contacts_unread_idx").on(table.seekerId).where(sql`${table.readAt} is null`),
    index("profile_contacts_salon_idx").on(table.salonId, table.kind, table.createdAt),
  ],
);

export const seekerExperience = pgTable(
  "seeker_experience",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    salonName: text("salon_name").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    /** YYYY-MM */
    startMonth: text("start_month").notNull(),
    /** YYYY-MM, null while current */
    endMonth: text("end_month"),
    description: text("description"),
    createdAt: createdAt(),
  },
  (table) => [index("seeker_experience_user_idx").on(table.userId)],
);

export const seekerEducation = pgTable(
  "seeker_education",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    qualification: text("qualification").notNull(),
    institution: text("institution"),
    year: integer("year"),
    createdAt: createdAt(),
  },
  (table) => [index("seeker_education_user_idx").on(table.userId)],
);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    imageKey: text("image_key").notNull(),
    caption: text("caption"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index("portfolio_items_user_idx").on(table.userId, table.sortOrder)],
);

export type CheckKind = "identity" | "right_to_work" | "qualification";

/**
 * A job seeker's verification checks. Once decided, only the reference (the verification
 * ID salons see, e.g. SSV-7K3M-9QXA), outcome and a minimal result are kept: documents and
 * document numbers are deleted (docs/decisions/D-03-verification-data.md).
 */
export const seekerChecks = pgTable(
  "seeker_checks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CheckKind>().notNull(),
    reference: text("reference").unique(),
    status: text("status").$type<VerificationStatus>().notNull().default("pending"),
    /** `stripe`, `mock` (local only) or `manual` (reviewed by staff). */
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    /** Minimal, non-identifying result, e.g. `{ nameMatched: true }` or `{ basis: "visa" }`. */
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    /** A certificate in the private bucket, only until a decision is made. */
    documentKey: text("document_key"),
    /** For a qualification: the education entry it verifies. Kept (null) if the entry is removed. */
    educationId: uuid("education_id").references(() => seekerEducation.id, {
      onDelete: "set null",
    }),
    reviewedBy: uuid("reviewed_by"),
    reviewNote: text("review_note"),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("seeker_checks_user_idx").on(table.userId, table.kind),
    index("seeker_checks_provider_ref_idx").on(table.providerRef),
    index("seeker_checks_pending_idx").on(table.status, table.createdAt),
    index("seeker_checks_education_idx").on(table.educationId),
  ],
);

/** Staff notes on a person. A flag blocks nothing; a ban (`users.suspended_at`) does. */
export const userFlags = pgTable(
  "user_flags",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").notNull(),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (table) => [index("user_flags_user_idx").on(table.userId)],
);

// ---------------------------------------------------------------------------
// Salons, the directory and claims
// ---------------------------------------------------------------------------

export type SalonStatus = "active" | "suspended" | "removed";

export const salons = pgTable(
  "salons",
  {
    id: id(),
    /**
     * Deprecated (D-11): who manages a salon is `salonMembers`. Never read or written; migration
     * 0004 copied it there. Dropped by a later migration.
     */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** URL: /salons/{state}/{suburb_slug}/{slug}. Unique within a suburb. */
    slug: text("slug").notNull(),
    suburbSlug: text("suburb_slug").notNull(),
    abn: text("abn"),
    abnStatus: text("abn_status").$type<VerificationStatus>().notNull().default("not_started"),
    abnEntityName: text("abn_entity_name"),
    contactName: text("contact_name"),
    phone: text("phone"),
    /** The business's own published email. Claim links are sent here. */
    email: text("email"),
    website: text("website"),
    instagram: text("instagram"),
    address: text("address"),
    suburb: text("suburb").notNull(),
    state: text("state").$type<AuState>().notNull(),
    postcode: text("postcode").notNull(),
    about: text("about"),
    logoKey: text("logo_key"),
    founding: boolean("founding").notNull().default(false),
    freeUntil: ts("free_until"),
    listingCredits: integer("listing_credits").notNull().default(0),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    subscriptionCurrentPeriodEnd: ts("subscription_current_period_end"),
    status: text("status").$type<SalonStatus>().notNull().default("active"),
    statusReason: text("status_reason"),
    /** `owner`: made by its owner. `directory`: added by us, claimable. */
    source: text("source").$type<"owner" | "directory">().notNull().default("owner"),
    claimedAt: ts("claimed_at"),
    /**
     * The suburb's centre (else the postcode's), for "near me" search. Set by the database from
     * `localities`/`postcodes` whenever the place changes (trigger `set_coordinates`); never written by code.
     */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("salons_path_uq").on(table.state, table.suburbSlug, table.slug),
    index("salons_owner_idx").on(table.ownerId),
    index("salons_abn_idx").on(table.abn),
    index("salons_directory_idx").on(table.status, table.state, table.suburbSlug),
    index("salons_location_idx").on(table.latitude, table.longitude),
  ],
);

export type SalonRole = "owner" | "manager";

/**
 * Who manages a salon (D-11). Owners do everything; managers handle jobs and applicants. A salon
 * with an owner is claimed; one with nobody is an unclaimed directory listing.
 */
export const salonMembers = pgTable(
  "salon_members",
  {
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<SalonRole>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.salonId, table.userId] }),
    index("salon_members_user_idx").on(table.userId),
  ],
);

/** An owner's emailed invitation to join a salon's team (D-11). Gone once accepted or cancelled. */
export const salonInvites = pgTable(
  "salon_invites",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<SalonRole>().notNull(),
    /** SHA-256 of the token in the emailed link. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("salon_invites_token_uq").on(table.tokenHash),
    uniqueIndex("salon_invites_email_uq").on(table.salonId, table.email),
  ],
);

export type ClaimStatus = "pending_email" | "pending_review" | "approved" | "rejected";

export const salonClaims = pgTable(
  "salon_claims",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    abn: text("abn").notNull(),
    abnEntityName: text("abn_entity_name"),
    contactName: text("contact_name").notNull(),
    phone: text("phone").notNull(),
    status: text("status").$type<ClaimStatus>().notNull(),
    /** SHA-256 of the token in the link emailed to the listing's address. */
    tokenHash: text("token_hash"),
    tokenExpiresAt: ts("token_expires_at"),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (table) => [index("salon_claims_status_idx").on(table.status, table.createdAt)],
);

// ---------------------------------------------------------------------------
// Jobs and applications
// ---------------------------------------------------------------------------

export type JobStatus = "draft" | "published" | "closed";

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    /** URL: /jobs/{state}/{suburb_slug}/{slug}. Unique within a suburb. */
    slug: text("slug").notNull(),
    suburbSlug: text("suburb_slug").notNull(),
    title: text("title").notNull(),
    role: text("role").$type<JobRole>().notNull(),
    employmentType: text("employment_type").$type<EmploymentType>().notNull(),
    payMin: doublePrecision("pay_min"),
    payMax: doublePrecision("pay_max"),
    payPeriod: text("pay_period").$type<PayPeriod>().notNull().default("hour"),
    suburb: text("suburb").notNull(),
    state: text("state").$type<AuState>().notNull(),
    postcode: text("postcode").notNull(),
    description: text("description").notNull(),
    requirements: text("requirements"),
    requireQualification: boolean("require_qualification").notNull().default(false),
    /**
     * Who on the salon's team is emailed about new applications (D-11). Null: everyone, including
     * people who join later.
     */
    notifyUserIds: uuid("notify_user_ids").array(),
    /** A published job is live until `expiresAt`, then shows as closed. */
    status: text("status").$type<JobStatus>().notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    /** free_period | subscription | credit | staff */
    paidVia: text("paid_via"),
    publishedAt: ts("published_at"),
    expiresAt: ts("expires_at"),
    /**
     * The suburb's centre (else the postcode's), for "near me" search. Set by the database from
     * `localities`/`postcodes` whenever the place changes (trigger `set_coordinates`); never written by code.
     */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("jobs_path_uq").on(table.state, table.suburbSlug, table.slug),
    index("jobs_feed_idx").on(table.status, table.expiresAt, table.publishedAt),
    index("jobs_salon_idx").on(table.salonId),
    index("jobs_role_place_idx").on(table.role, table.state, table.suburbSlug),
    index("jobs_location_idx").on(table.latitude, table.longitude),
  ],
);

// ---------------------------------------------------------------------------
// Places: where suburbs and postcodes are, for "near me" search
// ---------------------------------------------------------------------------

/**
 * The centre of every ABS suburb and locality (ASGS 2021, CC BY 4.0), loaded by a migration
 * (tools/directory/localities.ts). Names can repeat within a state ("Alison", NSW, twice), so
 * `postcodes` (the postal areas it lies in) tells them apart.
 */
export const localities = pgTable(
  "localities",
  {
    /** The ABS SAL code. */
    code: text("code").primaryKey(),
    state: text("state").$type<AuState>().notNull(),
    suburb: text("suburb").notNull(),
    suburbSlug: text("suburb_slug").notNull(),
    postcodes: text("postcodes").array().notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
  },
  (table) => [index("localities_place_idx").on(table.state, table.suburbSlug)],
);

/** The centre of every ABS postal area (ASGS 2021), for places whose suburb isn't in `localities`. */
export const postcodes = pgTable("postcodes", {
  postcode: text("postcode").primaryKey(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
});

/** An old public path that now answers with a 301 to the job's or salon's current one. */
export const slugRedirects = pgTable(
  "slug_redirects",
  {
    path: text("path").primaryKey(),
    kind: text("kind").$type<"job" | "salon">().notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("slug_redirects_target_idx").on(table.targetId)],
);

export const applications = pgTable(
  "applications",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    seekerId: uuid("seeker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coverNote: text("cover_note"),
    status: text("status").$type<ApplicationStatus>().notNull().default("submitted"),
    /** The newest message in its conversation (D-17), for sorting. */
    lastMessageAt: ts("last_message_at"),
    /** When the salon's team last read the conversation: the applicant's messages after it are unread. */
    salonReadAt: ts("salon_read_at"),
    /** When the applicant last read it: the salon's messages after it are unread. */
    seekerReadAt: ts("seeker_read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("applications_job_seeker_uq").on(table.jobId, table.seekerId),
    index("applications_seeker_idx").on(table.seekerId, table.createdAt),
  ],
);

/** The conversation on an application, between the salon's team and the applicant (D-17). */
export const applicationMessages = pgTable(
  "application_messages",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    from: text("from").$type<"salon" | "seeker">().notNull(),
    /** Who wrote it: the applicant, or someone on the salon's team. Null once their account is gone. */
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("application_messages_application_idx").on(table.applicationId, table.createdAt),
  ],
);

/**
 * The one conversation between a salon's team and a job seeker (D-19), however it started: from an
 * application, or from their profile. Replaces `application_messages` and emailed profile messages.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    salonId: uuid("salon_id")
      .notNull()
      .references(() => salons.id, { onDelete: "cascade" }),
    seekerId: uuid("seeker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The newest message, for sorting. */
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    /** When the salon's team last read it: the job seeker's messages after it are unread. */
    salonReadAt: ts("salon_read_at"),
    /** When the job seeker last read it: the salon's messages after it are unread. */
    seekerReadAt: ts("seeker_read_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("conversations_salon_seeker_uq").on(table.salonId, table.seekerId),
    index("conversations_seeker_idx").on(table.seekerId, table.lastMessageAt),
    index("conversations_salon_idx").on(table.salonId, table.lastMessageAt),
  ],
);

/** A message in a conversation, or a line saying the salon looked at the job seeker's number. */
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    from: text("from").$type<"salon" | "seeker">().notNull(),
    kind: text("kind").$type<"text" | "number_viewed">().notNull().default("text"),
    /** Who wrote it: the job seeker, or someone on the salon's team. Null once their account is gone. */
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    /** Empty for a number look. */
    body: text("body").notNull().default(""),
    /** The application it's about, if any. */
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    index("conversation_messages_conversation_idx").on(table.conversationId, table.createdAt),
  ],
);

export const savedJobs = pgTable(
  "saved_jobs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.jobId] })],
);

export const payments = pgTable("payments", {
  id: id(),
  salonId: uuid("salon_id")
    .notNull()
    .references(() => salons.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"single_listing" | "salon_plan" | "founding_plan">().notNull(),
  amountCents: integer("amount_cents").notNull(),
  /** `stripe`, or `mock` locally. */
  provider: text("provider").notNull(),
  checkoutRef: text("checkout_ref").unique(),
  status: text("status").$type<"pending" | "paid" | "failed">().notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// The admin portal (from kaybee). Staff are not users: Cloudflare Access
// proves who they are, by email. A removed staff member keeps their row so the
// audit log can still name them.
// ---------------------------------------------------------------------------

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  /** Lowercased. The address they pass Cloudflare Access with. */
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["owner", "support", "readonly"] }).notNull(),
  addedBy: uuid("added_by"),
  reason: text("reason"),
  lastSeenAt: ts("last_seen_at"),
  removedAt: ts("removed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The passkeys a staff member confirms dangerous changes with. Public keys only. */
export const staffPasskeys = pgTable(
  "staff_passkeys",
  {
    id: uuid("id").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: text("transports").array().notNull().default([]),
    name: text("name").notNull(),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
  },
  (table) => [index("staff_passkeys_staff_idx").on(table.staffId)],
);

/** Passkey challenges not yet answered. `register` adds a passkey; `confirm` approves one action. */
export const staffConfirmations = pgTable(
  "staff_confirmations",
  {
    id: uuid("id").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["register", "confirm"] }).notNull(),
    action: text("action"),
    target: text("target"),
    challenge: text("challenge").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (table) => [index("staff_confirmations_expires_idx").on(table.expiresAt)],
);

/**
 * Who did what, and when: people, staff and the system. Rows are never updated or deleted,
 * and have no foreign keys so they outlive what they describe.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    actorType: text("actor_type", { enum: ["user", "staff", "system"] }).notNull(),
    actorId: uuid("actor_id"),
    /** e.g. `salon.suspended` */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    requestId: text("request_id"),
    reason: text("reason"),
    /** The staff passkey that confirmed it, for changes that need one. */
    confirmedWith: uuid("confirmed_with"),
  },
  (table) => [
    index("audit_log_target_idx").on(table.targetId, table.id),
    index("audit_log_actor_idx").on(table.actorId, table.id),
  ],
);
