/** Turns database rows into the API's JSON: prefixed IDs, ISO dates, public paths, picture URLs. */
import { isStandInEmail } from "@salonstaff/auth";
import type {
  Applicant,
  ApplicationMessage,
  Candidate,
  CheckSummary,
  Claim,
  ContactRecord,
  DirectoryEntry,
  Endorsement,
  Experience,
  FullProfile,
  Invite,
  Job,
  JobWithSalon,
  MyApplication,
  PageOf,
  PortfolioItem,
  Salon,
  SalonApplicant,
  SalonJob,
  SalonRole,
  SeekerProfile,
  SharedProfile,
  ShownEndorsement,
  TeamMember,
} from "@salonstaff/db";
import { isClaimed } from "@salonstaff/db";
import {
  encodeId,
  entitlementOf,
  formatPay,
  jobPath,
  type MessageBlocker,
  maskEmail,
  profilePath,
  publicName,
  type SalonAccess,
  salonPath,
  shareLinkWorks,
} from "@salonstaff/shared";
import type { Env } from "../env";
import { roundedKm } from "./near";
import { mediaUrl } from "./storage";

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export const isClosed = (job: Job, now = new Date()) =>
  !(job.status === "published" && job.expiresAt !== null && job.expiresAt > now);

export function pageJson<T, U>(page: PageOf<T>, map: (item: T) => U) {
  return {
    items: page.items.map(map),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    pageCount: Math.max(1, Math.ceil(page.total / page.pageSize)),
  };
}

export function verificationJson(checks: CheckSummary) {
  return {
    identity: checks.identity,
    rightToWork: checks.rightToWork,
    qualification: checks.qualification,
    level: checks.level,
    references: checks.references,
    nameMatched: checks.nameMatched,
    identityVerifiedAt: iso(checks.identityVerifiedAt),
    qualificationTitle: checks.qualificationTitle,
    rightToWorkBasis: checks.rightToWorkBasis,
    rightToWorkCheckedVia: checks.rightToWorkCheckedVia,
  };
}

export function profileJson(env: Env, row: SeekerProfile) {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    headline: row.headline,
    about: row.about,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    roles: row.roles,
    yearsExperience: row.yearsExperience,
    instagram: row.instagram,
    tiktok: row.tiktok,
    rightToWork: row.rightToWork,
    openToWork: row.openToWork,
    photoUrl: mediaUrl(env, row.photoKey),
    specialties: row.specialties,
    brands: row.brands,
    availableDays: row.availableDays,
    employmentTypes: row.employmentTypes,
    availableFrom: row.availableFrom,
    travelKm: row.travelKm,
    payMin: row.payMin,
    payPeriod: row.payPeriod,
  };
}

/** Who sees the profile and how salons contact them: for the job seeker only. */
export const profileSettingsJson = (row: SeekerProfile) => ({
  visibility: row.visibility,
  contactBy: row.contactBy,
  shareCode: row.shareCode,
  sharePath: row.shareCode && shareLinkWorks(row.visibility) ? profilePath(row.shareCode) : null,
});

/**
 * A shown endorsement. The referee's contact details only with `withContact` (a salon the person
 * applied to) and only if the referee agreed.
 */
export const endorsementJson = (
  { endorsement: e, refereeSalon }: ShownEndorsement,
  withContact = false,
) => ({
  id: encodeId("endorsement", e.id),
  refereeName: e.refereeName,
  refereeTitle: e.refereeTitle,
  salonName: e.salonName,
  relationship: e.relationship,
  body: e.body ?? "",
  writtenAt: iso(e.writtenAt) ?? e.createdAt.toISOString(),
  onSalonStaff: refereeSalon ? { name: refereeSalon.name, path: salonPath(refereeSalon) } : null,
  contact: withContact && e.contactOk ? { email: e.refereeEmail, phone: e.refereePhone } : null,
});

/** One of the job seeker's own endorsements or requests, with everything about it. */
export const myEndorsementJson = (e: Endorsement) => ({
  id: encodeId("endorsement", e.id),
  status: e.status,
  refereeName: e.refereeName,
  refereeEmail: e.refereeEmail,
  note: e.note,
  linkExpiresAt: iso(e.tokenExpiresAt),
  refereeTitle: e.refereeTitle,
  salonName: e.salonName,
  relationship: e.relationship,
  body: e.body,
  contactOk: e.contactOk,
  refereePhone: e.refereePhone,
  onSalonStaff: e.refereeSalonId !== null,
  writtenAt: iso(e.writtenAt),
  createdAt: e.createdAt.toISOString(),
});

/** A salon's message or number reveal, for the job seeker's list (D-13). */
export const contactRecordJson = ({ contact, salon, sender, hidden }: ContactRecord) => ({
  id: encodeId("profileContact", contact.id),
  kind: contact.kind,
  message: contact.message,
  read: contact.readAt !== null,
  sender: sender && contact.kind === "message" ? { name: sender.name, email: sender.email } : null,
  createdAt: contact.createdAt.toISOString(),
  salon: { id: encodeId("salon", salon.id), name: salon.name, path: salonPath(salon) },
  hidden,
});

export const contactOptionsJson = (access: SalonAccess) => ({
  message: access.message,
  phone: access.phone,
});

export const experienceJson = (row: Experience) => ({
  id: encodeId("experience", row.id),
  salonName: row.salonName,
  title: row.title,
  location: row.location,
  startMonth: row.startMonth,
  endMonth: row.endMonth,
  description: row.description,
});

export const educationJson = (row: FullProfile["education"][number]) => ({
  id: encodeId("education", row.id),
  qualification: row.qualification,
  institution: row.institution,
  year: row.year,
  verification: row.check ? { status: row.check.status, reference: row.check.reference } : null,
});

export const portfolioJson = (env: Env, row: PortfolioItem) => ({
  id: encodeId("portfolioItem", row.id),
  imageUrl: mediaUrl(env, row.imageKey) as string,
  caption: row.caption,
});

export function fullProfileJson(
  env: Env,
  full: FullProfile,
  options: { refereeContacts?: boolean } = {},
) {
  return {
    profile: profileJson(env, full.profile),
    experience: full.experience.map(experienceJson),
    education: full.education.map(educationJson),
    portfolio: full.portfolio.map((item) => portfolioJson(env, item)),
    endorsements: full.endorsements.map((e) => endorsementJson(e, options.refereeContacts)),
    verification: verificationJson(full.checks),
  };
}

/** The job seeker's own profile, with its settings. */
export const myProfileJson = (env: Env, full: FullProfile) => ({
  ...fullProfileJson(env, full),
  settings: profileSettingsJson(full.profile),
});

/** A profile through its share link: no surname, postcode, work rights, pay or contact details. */
export function sharedProfileJson(env: Env, { full }: SharedProfile) {
  const {
    lastName: _l,
    postcode: _p,
    rightToWork: _r,
    payMin: _m,
    payPeriod: _pp,
    ...profile
  } = profileJson(env, full.profile);
  const { profile: _, verification, education, ...rest } = fullProfileJson(env, full);
  return {
    name: publicName(full.profile.firstName, full.profile.lastName),
    profile,
    ...rest,
    // Passed or not, but not the verification ID: that's for salons.
    education: education.map((e) => ({
      ...e,
      verification: e.verification && { ...e.verification, reference: null },
    })),
    // Which checks passed and how work rights were checked, never the verification IDs.
    verification: {
      identity: verification.identity,
      rightToWork: verification.rightToWork,
      qualification: verification.qualification,
      level: verification.level,
      rightToWorkBasis: verification.rightToWorkBasis,
      rightToWorkCheckedVia: verification.rightToWorkCheckedVia,
    },
  };
}

/** A real address to write to, or null for a mobile-only account's stand-in. */
export const realEmail = (email: string | null | undefined) =>
  email && !isStandInEmail(email) ? email : null;

// ---------- Salons and jobs ----------

export const salonSummaryJson = (env: Env, salon: Salon) => ({
  id: encodeId("salon", salon.id),
  name: salon.name,
  path: salonPath(salon),
  suburb: salon.suburb,
  state: salon.state,
  logoUrl: mediaUrl(env, salon.logoKey),
  verified: isClaimed(salon) && salon.abnStatus === "verified",
  claimed: isClaimed(salon),
});

export const jobSummaryJson = (env: Env, { job, salon }: JobWithSalon) => ({
  id: encodeId("job", job.id),
  slug: job.slug,
  path: jobPath(job),
  title: job.title,
  role: job.role,
  employmentType: job.employmentType,
  payMin: job.payMin,
  payMax: job.payMax,
  payPeriod: job.payPeriod,
  pay: formatPay(job.payMin, job.payMax, job.payPeriod),
  suburb: job.suburb,
  suburbSlug: job.suburbSlug,
  state: job.state,
  postcode: job.postcode,
  featured: job.featured,
  closed: isClosed(job),
  publishedAt: iso(job.publishedAt),
  expiresAt: iso(job.expiresAt),
  salon: salonSummaryJson(env, salon),
});

export const jobDetailJson = (env: Env, row: JobWithSalon) => ({
  ...jobSummaryJson(env, row),
  description: row.job.description,
  requirements: row.job.requirements,
  requireQualification: row.job.requireQualification,
});

export function effectiveStatus(job: Job): "draft" | "published" | "expired" | "closed" {
  if (job.status === "published" && isClosed(job)) return "expired";
  return job.status;
}

export const salonJobJson = (env: Env, salon: Salon, job: SalonJob) => ({
  ...jobDetailJson(env, { job, salon }),
  status: effectiveStatus(job),
  paidVia: job.paidVia,
  applicants: job.applicants,
  newApplicants: job.newApplicants,
  notifyUserIds: job.notifyUserIds?.map((id) => encodeId("user", id)) ?? null,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
});

export function entitlementJson(salon: Salon) {
  const entitlement = entitlementOf(salon);
  return entitlement.ok
    ? { ok: true, via: entitlement.via, reason: null }
    : { ok: false, via: null, reason: entitlement.reason };
}

export const mySalonJson = (env: Env, salon: Salon, role: SalonRole) => ({
  id: encodeId("salon", salon.id),
  name: salon.name,
  slug: salon.slug,
  path: salonPath(salon),
  abn: salon.abn,
  abnStatus: salon.abnStatus,
  abnEntityName: salon.abnEntityName,
  contactName: salon.contactName,
  phone: salon.phone,
  email: salon.email,
  website: salon.website,
  instagram: salon.instagram,
  address: salon.address,
  suburb: salon.suburb,
  state: salon.state,
  postcode: salon.postcode,
  about: salon.about,
  logoUrl: mediaUrl(env, salon.logoKey),
  status: salon.status,
  statusReason: salon.statusReason,
  source: salon.source,
  founding: salon.founding,
  freeUntil: iso(salon.freeUntil),
  listingCredits: salon.listingCredits,
  claimedAt: iso(salon.claimedAt),
  createdAt: salon.createdAt.toISOString(),
  entitlement: entitlementJson(salon),
  role,
});

export const teamMemberJson = (member: TeamMember, you: string) => ({
  userId: encodeId("user", member.userId),
  name: member.name,
  email: realEmail(member.email),
  role: member.role,
  joinedAt: member.joinedAt.toISOString(),
  you: member.userId === you,
});

export const teamInviteJson = (invite: Invite) => ({
  id: encodeId("invite", invite.id),
  email: invite.email,
  role: invite.role,
  expiresAt: invite.expiresAt.toISOString(),
  createdAt: invite.createdAt.toISOString(),
});

export const directorySalonJson = (env: Env, { salon, liveJobs, distanceKm }: DirectoryEntry) => ({
  ...salonSummaryJson(env, salon),
  suburbSlug: salon.suburbSlug,
  about: salon.about,
  liveJobs,
  distanceKm: roundedKm(distanceKm),
});

export function applicantJson(env: Env, row: Applicant) {
  const p = row.profile;
  return {
    id: encodeId("application", row.application.id),
    status: row.application.status,
    isNew: row.isNew,
    coverNote: row.application.coverNote,
    createdAt: row.application.createdAt.toISOString(),
    candidateId: encodeId("user", row.user.id),
    candidate: p
      ? {
          id: encodeId("user", row.user.id),
          firstName: p.firstName,
          lastName: p.lastName,
          headline: p.headline,
          photoUrl: mediaUrl(env, p.photoKey),
          suburb: p.suburb,
          state: p.state,
          roles: p.roles,
          yearsExperience: p.yearsExperience,
          rightToWork: p.rightToWork,
        }
      : null,
    verification: verificationJson(row.checks),
  };
}

export const candidateJson = (env: Env, userId: string, candidate: Candidate) => ({
  id: encodeId("user", userId),
  ...fullProfileJson(env, candidate, { refereeContacts: candidate.applications.length > 0 }),
  contact: contactOptionsJson(candidate.access),
  applications: candidate.applications.map((a) => ({
    id: encodeId("application", a.id),
    jobId: encodeId("job", a.jobId),
    jobTitle: a.jobTitle,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  })),
});

export const claimJson = (claim: Claim, salon: Pick<Salon, "email">) => ({
  id: encodeId("claim", claim.id),
  salonId: encodeId("salon", claim.salonId),
  status: claim.status,
  sentTo: claim.status === "pending_email" && salon.email ? maskEmail(salon.email) : null,
  decisionNote: claim.decisionNote,
  createdAt: claim.createdAt.toISOString(),
  decidedAt: iso(claim.decidedAt),
});

// ---------- Conversations on applications (D-17) ----------

export const messageJson = (m: ApplicationMessage) => ({
  id: encodeId("message", m.id),
  from: m.from,
  senderName: m.senderName,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

const SEND_HINTS: Record<MessageBlocker, string> = {
  salon_suspended: "This salon can't send or receive messages right now.",
  wait_for_salon:
    "You can reply once the salon writes to you. Your cover note is with them already.",
};

export const sendStateJson = (blocker: MessageBlocker | null) => ({
  canSend: blocker === null,
  sendHint: blocker ? SEND_HINTS[blocker] : null,
});

export const salonApplicantJson = (env: Env, row: SalonApplicant) => ({
  ...applicantJson(env, row),
  job: {
    id: encodeId("job", row.job.id),
    title: row.job.title,
    path: jobPath(row.job),
    status: row.job.status,
  },
  unreadMessages: row.unread,
  lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
});

export const myApplicationJson = (env: Env, row: MyApplication) => ({
  id: encodeId("application", row.application.id),
  status: row.application.status,
  coverNote: row.application.coverNote,
  createdAt: row.application.createdAt.toISOString(),
  job: jobSummaryJson(env, row),
  unreadMessages: row.unread,
});
