/** Turns database rows into the API's JSON: prefixed IDs, ISO dates, public paths, picture URLs. */
import { isStandInEmail } from "@salonstaff/auth";
import type {
  Applicant,
  Candidate,
  CheckSummary,
  Claim,
  Contact,
  DirectoryEntry,
  Education,
  Experience,
  FullProfile,
  Job,
  JobWithSalon,
  PageOf,
  PortfolioItem,
  Salon,
  SalonJob,
  SeekerProfile,
} from "@salonstaff/db";
import {
  encodeId,
  entitlementOf,
  formatPay,
  jobPath,
  maskEmail,
  salonPath,
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
  };
}

export function profileJson(env: Env, row: SeekerProfile) {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    headline: row.headline,
    about: row.about,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    roles: row.roles,
    yearsExperience: row.yearsExperience,
    qualifications: row.qualifications,
    instagram: row.instagram,
    rightToWork: row.rightToWork,
    openToWork: row.openToWork,
    photoUrl: mediaUrl(env, row.photoKey),
    specialties: row.specialties,
    brands: row.brands,
    availableDays: row.availableDays,
    employmentTypes: row.employmentTypes,
    availableFrom: row.availableFrom,
    travelKm: row.travelKm,
    payExpectation: row.payExpectation,
  };
}

export const experienceJson = (row: Experience) => ({
  id: encodeId("experience", row.id),
  salonName: row.salonName,
  title: row.title,
  location: row.location,
  startMonth: row.startMonth,
  endMonth: row.endMonth,
  description: row.description,
});

export const educationJson = (row: Education) => ({
  id: encodeId("education", row.id),
  qualification: row.qualification,
  institution: row.institution,
  year: row.year,
});

export const portfolioJson = (env: Env, row: PortfolioItem) => ({
  id: encodeId("portfolioItem", row.id),
  imageUrl: mediaUrl(env, row.imageKey) as string,
  caption: row.caption,
});

export function fullProfileJson(env: Env, full: FullProfile) {
  return {
    profile: profileJson(env, full.profile),
    experience: full.experience.map(experienceJson),
    education: full.education.map(educationJson),
    portfolio: full.portfolio.map((item) => portfolioJson(env, item)),
    verification: verificationJson(full.checks),
  };
}

/** A real address to write to, or null for a mobile-only account's stand-in. */
export const realEmail = (email: string | null | undefined) =>
  email && !isStandInEmail(email) ? email : null;

export const contactJson = (contact: Contact, profilePhone?: string | null) => ({
  email: realEmail(contact.email),
  phone: profilePhone ?? contact.phoneNumber,
});

// ---------- Salons and jobs ----------

export const salonSummaryJson = (env: Env, salon: Salon) => ({
  id: encodeId("salon", salon.id),
  name: salon.name,
  path: salonPath(salon),
  suburb: salon.suburb,
  state: salon.state,
  logoUrl: mediaUrl(env, salon.logoKey),
  verified: salon.ownerId !== null && salon.abnStatus === "verified",
  claimed: salon.ownerId !== null,
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
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
});

export function entitlementJson(salon: Salon) {
  const entitlement = entitlementOf(salon);
  return entitlement.ok
    ? { ok: true, via: entitlement.via, reason: null }
    : { ok: false, via: null, reason: entitlement.reason };
}

export const mySalonJson = (env: Env, salon: Salon) => ({
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
  ...fullProfileJson(env, candidate),
  contact: contactJson(candidate.contact, candidate.profile.phone),
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
