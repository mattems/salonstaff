/** schema.org JSON-LD for job ads and salon pages (D-07). */
import { BRAND, type EmploymentType, JOB_ROLES } from "@salonstaff/shared";
import type { Schemas } from "./api";
import { absolute } from "./seo";

const EMPLOYMENT: Record<EmploymentType, string[]> = {
  full_time: ["FULL_TIME"],
  part_time: ["PART_TIME"],
  casual: ["PART_TIME", "TEMPORARY"],
  contract: ["CONTRACTOR"],
  apprenticeship: ["FULL_TIME", "INTERN"],
  chair_rental: ["CONTRACTOR"],
};

const UNIT = { hour: "HOUR", week: "WEEK", year: "YEAR" } as const;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Google wants the description as HTML: paragraphs from the plain text. */
const asHtml = (...texts: (string | null)[]) =>
  texts
    .filter((text): text is string => Boolean(text))
    .flatMap((text) => text.split(/\n{2,}/))
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");

export function jobPosting(job: Schemas["JobDetail"]) {
  const salary =
    job.payMin || job.payMax
      ? {
          "@type": "MonetaryAmount",
          currency: "AUD",
          value: {
            "@type": "QuantitativeValue",
            ...(job.payMin && job.payMax && job.payMin !== job.payMax
              ? { minValue: job.payMin, maxValue: job.payMax }
              : { value: job.payMin ?? job.payMax }),
            unitText: UNIT[job.payPeriod],
          },
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: asHtml(job.description, job.requirements),
    identifier: { "@type": "PropertyValue", name: BRAND.name, value: job.id },
    datePosted: job.publishedAt ?? undefined,
    validThrough: job.expiresAt ?? undefined,
    employmentType: EMPLOYMENT[job.employmentType],
    occupationalCategory: JOB_ROLES.find((role) => role.value === job.role)?.label,
    directApply: true,
    url: absolute(job.path),
    hiringOrganization: {
      "@type": "Organization",
      name: job.salon.name,
      sameAs: absolute(job.salon.path),
      ...(job.salon.logoUrl ? { logo: job.salon.logoUrl } : {}),
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.suburb,
        addressRegion: job.state,
        postalCode: job.postcode,
        addressCountry: "AU",
      },
    },
    ...(salary ? { baseSalary: salary } : {}),
  };
}

const BEAUTY_WORDS =
  /\b(beauty|nails?|lash(es)?|brows?|skin|spa|aesthetics?|cosmetic|wax(ing)?)\b/i;

/** A hair salon, unless it's clearly a beauty business (by its jobs, or else its name). */
function businessType(salon: { name: string }, jobs: Schemas["JobSummary"][]) {
  if (jobs.length > 0) {
    const groups = new Set(
      jobs.map((job) => JOB_ROLES.find((role) => role.value === job.role)?.group),
    );
    if (groups.has("beauty") && !groups.has("hair")) return "BeautySalon";
    if (groups.has("hair")) return "HairSalon";
  }
  return BEAUTY_WORDS.test(salon.name) ? "BeautySalon" : "HairSalon";
}

export function salonBusiness(salon: Schemas["PublicSalon"], jobs: Schemas["JobSummary"][]) {
  const sameAs = [
    salon.website,
    salon.instagram ? `https://www.instagram.com/${salon.instagram.replace(/^@/, "")}` : null,
  ].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": businessType(salon, jobs),
    name: salon.name,
    url: absolute(salon.path),
    ...(salon.about ? { description: salon.about } : {}),
    ...(salon.logoUrl ? { logo: salon.logoUrl } : {}),
    ...(salon.heroUrl || salon.logoUrl ? { image: salon.heroUrl ?? salon.logoUrl } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: salon.suburb,
      addressRegion: salon.state,
      postalCode: salon.postcode,
      addressCountry: "AU",
    },
  };
}
