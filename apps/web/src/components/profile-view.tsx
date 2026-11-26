/**
 * A job seeker's profile: the seeker's own preview, a salon looking at a candidate (with ways to
 * contact them), and the share page (D-13: no surname, work rights, pay or contact details).
 */
import { ENDORSEMENT_RELATIONSHIPS, formatPay, labelFor, WEEKDAYS } from "@salonstaff/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@salonstaff/ui/components/avatar";
import { Badge } from "@salonstaff/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { cn } from "@salonstaff/ui/lib/utils";
import type { ReactNode } from "react";
import { AppLink } from "@/components/app-link";
import { VerifiedTick } from "@/components/qualification-check";
import type { Schemas } from "@/lib/api";
import {
  employmentLabel,
  formatDate,
  formatMonth,
  initials,
  rightToWorkLabel,
  roleLabel,
} from "@/lib/format";

function duration(start: string, end: string | null) {
  const [sy = 0, sm = 1] = start.split("-").map(Number);
  const now = new Date();
  const [ey = now.getFullYear(), em = now.getMonth() + 1] = end
    ? end.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const months = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years && `${years} yr${years > 1 ? "s" : ""}`, rest && `${rest} mo${rest > 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(" ");
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type Status = Schemas["Verification"]["identity"];

/** What every view of a profile has. The share page leaves out the private parts. */
export interface ViewableProfile {
  /** "Jess Demo", or "Jess D." on the share page. */
  name: string;
  profile: Omit<
    Schemas["SeekerProfile"],
    "lastName" | "postcode" | "rightToWork" | "payMin" | "payPeriod"
  > &
    Partial<Pick<Schemas["SeekerProfile"], "rightToWork" | "payMin" | "payPeriod">>;
  experience: Schemas["Experience"][];
  education: Schemas["Education"][];
  portfolio: Schemas["PortfolioItem"][];
  endorsements: Schemas["Endorsement"][];
  verification: {
    identity: Status;
    rightToWork: Status;
    qualification: Status;
    references?: Schemas["Verification"]["references"];
  };
}

/** A full profile (their own, or a salon's candidate) as `ProfileView` takes it. */
export const viewable = (full: Schemas["FullProfile"]): ViewableProfile => ({
  ...full,
  name: `${full.profile.firstName} ${full.profile.lastName}`,
});

export function VerificationList({
  verification: v,
}: {
  verification: ViewableProfile["verification"];
}) {
  const rows = [
    ["Identity", v.identity, v.references?.identity],
    ["Right to work", v.rightToWork, v.references?.rightToWork],
    ["Qualification", v.qualification, v.references?.qualification],
  ] as const;
  return (
    <ul className="space-y-3 text-sm">
      {rows.map(([label, status, reference]) => (
        <li key={label} className="flex items-start justify-between gap-3">
          <span className={status === "verified" ? "" : "text-muted-foreground"}>{label}</span>
          <span className="text-right">
            {status === "verified" ? (
              <>
                <span className="block font-medium">Verified</span>
                {reference && (
                  <span className="font-mono text-muted-foreground text-xs">{reference}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                {status === "pending"
                  ? "In review"
                  : status === "failed"
                    ? "Not verified"
                    : "Not yet"}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const handleOf = (value: string) => value.replace(/^@/, "");

export function ProfileView({
  full,
  actions,
  aside,
}: {
  full: ViewableProfile;
  /** Ways to get in touch (a salon's contact buttons, or a sign-in prompt), under the name. */
  actions?: ReactNode;
  /** Extra content for the side column (application status, say). */
  aside?: ReactNode;
}) {
  const { profile: p, experience, education, portfolio, endorsements, verification: v } = full;
  const { name } = full;
  const today = new Date().toISOString().slice(0, 10);
  const pay = p.payMin ? formatPay(p.payMin, null, p.payPeriod) : null;
  const hasAvailability =
    p.availableDays.length > 0 ||
    p.employmentTypes.length > 0 ||
    p.availableFrom ||
    p.travelKm != null ||
    pay;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="size-24">
              {p.photoUrl && <AvatarImage src={p.photoUrl} alt={name} />}
              <AvatarFallback className="text-2xl">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-semibold text-2xl tracking-tight">{name}</h1>
                {p.openToWork && <Badge variant="secondary">Open to work</Badge>}
              </div>
              {p.headline && <p className="text-lg">{p.headline}</p>}
              <p className="flex flex-wrap gap-x-4 text-muted-foreground text-sm">
                <span>
                  {p.suburb}, {p.state}
                </span>
                <span>
                  {p.yearsExperience} year{p.yearsExperience === 1 ? "" : "s"} experience
                </span>
                {p.rightToWork && <span>{rightToWorkLabel(p.rightToWork)}</span>}
                {p.instagram && (
                  <a
                    href={`https://www.instagram.com/${handleOf(p.instagram)}`}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="underline"
                  >
                    Instagram @{handleOf(p.instagram)}
                  </a>
                )}
                {p.tiktok && (
                  <a
                    href={`https://www.tiktok.com/@${handleOf(p.tiktok)}`}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="underline"
                  >
                    TikTok @{handleOf(p.tiktok)}
                  </a>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {v.identity === "verified" && <Badge>ID verified</Badge>}
            {v.rightToWork === "verified" && <Badge>Work rights checked</Badge>}
            {v.qualification === "verified" && <Badge>Qualification verified</Badge>}
            {p.roles.map((role) => (
              <Badge key={role} variant="outline">
                {roleLabel(role)}
              </Badge>
            ))}
          </div>
          {actions && <div className="border-t pt-4">{actions}</div>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {p.about && (
            <Panel title="About">
              <p className="whitespace-pre-line leading-relaxed">{p.about}</p>
            </Panel>
          )}
          {portfolio.length > 0 && (
            <Panel title="Portfolio">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {portfolio.map((item) => (
                  <figure key={item.id} className="space-y-1">
                    <a href={item.imageUrl} target="_blank" rel="noreferrer">
                      <img
                        src={item.imageUrl}
                        alt={item.caption ?? "Portfolio photo"}
                        className="aspect-square w-full rounded-lg border object-cover"
                      />
                    </a>
                    {item.caption && (
                      <figcaption className="text-muted-foreground text-xs">
                        {item.caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </Panel>
          )}
          {(p.specialties.length > 0 || p.brands.length > 0) && (
            <Panel title="Specialties and skills">
              <div className="space-y-4">
                {p.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {p.specialties.map((item) => (
                      <Badge key={item} variant="secondary">
                        {item}
                      </Badge>
                    ))}
                  </div>
                )}
                {p.brands.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                      Brands and products trained in
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {p.brands.map((item) => (
                        <Badge key={item} variant="outline">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}
          {endorsements.length > 0 && (
            <Panel title="Endorsements">
              <ul className="space-y-6">
                {endorsements.map((item) => (
                  <li key={item.id} className="space-y-2">
                    <blockquote className="whitespace-pre-line border-l-2 pl-4 leading-relaxed">
                      {item.body}
                    </blockquote>
                    <p className="text-sm">
                      <span className="font-medium">{item.refereeName}</span>
                      {item.refereeTitle && `, ${item.refereeTitle}`}
                      {item.salonName && ` · ${item.salonName}`}
                      {item.relationship && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {labelFor(ENDORSEMENT_RELATIONSHIPS, item.relationship)}
                        </span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {item.onSalonStaff ? (
                        <Badge variant="secondary" asChild>
                          <AppLink href={item.onSalonStaff.path}>
                            On Salon Staff: {item.onSalonStaff.name}
                          </AppLink>
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Email address confirmed</span>
                      )}
                      <span className="text-muted-foreground">{formatDate(item.writtenAt)}</span>
                    </div>
                    {item.contact && (
                      <p className="text-muted-foreground text-sm">
                        Happy to be contacted:{" "}
                        <a href={`mailto:${item.contact.email}`} className="underline">
                          {item.contact.email}
                        </a>
                        {item.contact.phone && (
                          <>
                            {" · "}
                            <a href={`tel:${item.contact.phone}`} className="underline">
                              {item.contact.phone}
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {experience.length > 0 && (
            <Panel title="Experience">
              <ol className="space-y-5">
                {experience.map((item) => (
                  <li key={item.id} className="border-l-2 pl-4">
                    <p className="font-medium">{item.title}</p>
                    <p>
                      {item.salonName}
                      {item.location && (
                        <span className="text-muted-foreground"> · {item.location}</span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {formatMonth(item.startMonth)} – {formatMonth(item.endMonth)} ·{" "}
                      {duration(item.startMonth, item.endMonth)}
                    </p>
                    {item.description && (
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {education.length > 0 && (
            <Panel title="Qualifications">
              <ul className="space-y-3">
                {education.map((item) => (
                  <li key={item.id}>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {item.qualification}
                      {item.verification?.status === "verified" && (
                        <VerifiedTick reference={item.verification.reference} />
                      )}
                    </p>
                    {(item.institution || item.year) && (
                      <p className="text-muted-foreground text-sm">
                        {[item.institution, item.year].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-6">
          {aside}
          {hasAvailability && (
            <Panel title="Availability">
              {p.availableDays.length > 0 && (
                <div className="mb-4 grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day) => {
                    const on = p.availableDays.includes(day.value);
                    return (
                      <div
                        key={day.value}
                        className={cn(
                          "rounded-md py-1.5 text-center font-medium text-xs",
                          on
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {day.label}
                        <span className="sr-only">{on ? ": available" : ": not available"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <dl className="space-y-2 text-sm">
                {p.employmentTypes.length > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Looking for</dt>
                    <dd className="text-right">
                      {p.employmentTypes.map(employmentLabel).join(", ")}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Can start</dt>
                  <dd>
                    {p.availableFrom && p.availableFrom > today
                      ? formatDate(p.availableFrom)
                      : "Now"}
                  </dd>
                </div>
                {p.travelKm != null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Will travel</dt>
                    <dd>Up to {p.travelKm} km</dd>
                  </div>
                )}
                {pay && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Pay</dt>
                    <dd className="text-right">From {pay}</dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}
          <Panel title="Verification">
            <VerificationList verification={v} />
            <p className="mt-4 border-t pt-4 text-muted-foreground text-xs">
              Checked by Salon Staff. We keep only the verification ID, never copies of ID
              documents.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
