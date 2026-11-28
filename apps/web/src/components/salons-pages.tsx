/**
 * The /salons pages (D-07): the directory by place, salon pages, and claiming a listing
 * (`{salon page}/claim`, D-04).
 */
import { AU_STATES, BRAND, PRICING, salonsLandingPath } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { Input } from "@salonstaff/ui/components/input";
import { notFound, redirect, useNavigate } from "@tanstack/react-router";
import {
  AtSignIcon,
  BadgeCheckIcon,
  BriefcaseIcon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
} from "lucide-react";
import type { FormEvent } from "react";
import { ApiProblem, api, type Schemas } from "@/lib/api";
import { stateLabel } from "@/lib/format";
import { breadcrumbList, itemList, seo, withPage } from "@/lib/seo";
import { signInPath } from "@/lib/session";
import { salonBusiness } from "@/lib/structured-data";
import { AppLink } from "./app-link";
import { selectClass } from "./form";
import { Breadcrumbs, JobList, Pagination, SalonCard } from "./listing";
import {
  describeNear,
  isNear,
  NearMeFields,
  type NearValues,
  nearFromForm,
  nearParams,
  nearQuery,
} from "./near-me";
import { EmptyState, Page, Section } from "./page";
import { SalonHeader } from "./salon-brand";

export type SalonsLanding = Extract<Schemas["SalonsPath"], { kind: "landing" }>;
export type SalonPage = Extract<Schemas["SalonsPath"], { kind: "salon" }>;
export interface SalonSearchValues extends NearValues {
  q?: string | undefined;
  /** Only salons with a live job. */
  hiring?: boolean | undefined;
}
export type SalonsSearch = {
  kind: "search";
  values: SalonSearchValues;
  salons: Schemas["SalonList"];
};
export type SalonClaimPage = { kind: "claim"; page: SalonPage };
export type SalonsPageData = SalonsLanding | SalonPage | SalonsSearch | SalonClaimPage;

export async function loadSalonsPath(path: string, page = 1): Promise<SalonsLanding | SalonPage> {
  const { data, error, response } = await api.GET("/v1/salons/by-path", {
    params: { query: { path, page } },
  });
  if (response.status === 404 || response.status === 400) throw notFound();
  if (!data) throw new ApiProblem(response.status, error);
  if (data.kind === "redirect") throw redirect({ href: data.redirect, statusCode: 301 });
  if (data.kind === "landing" && page > 1 && page > data.salons.pageCount) throw notFound();
  return data;
}

/** `/salons/{state}/{suburb}/{salon}/claim`: the salon's page, to claim. */
export async function loadClaimPage(salonPath: string): Promise<SalonClaimPage> {
  const page = await loadSalonsPath(salonPath);
  if (page.kind !== "salon") throw notFound();
  // A renamed salon's claim page follows it.
  if (page.salon.path !== salonPath) {
    throw redirect({ href: `${page.salon.path}/claim`, statusCode: 301 });
  }
  return { kind: "claim", page };
}

/** A search's query values, for the address and the API. */
export const salonSearchParams = (values: SalonSearchValues) => ({
  q: values.q,
  hiring: values.hiring ? "true" : undefined,
  ...nearParams(values),
});

export const isSalonSearch = (values: SalonSearchValues) =>
  Boolean(values.q || values.hiring || isNear(values));

export async function searchSalons(values: SalonSearchValues, page = 1): Promise<SalonsSearch> {
  const { data, error, response } = await api.GET("/v1/salons", {
    params: {
      query: {
        q: values.q,
        hiring: values.hiring ? ("true" as const) : undefined,
        ...nearQuery(values),
        page,
      },
    },
  });
  if (!data) throw new ApiProblem(response.status, error);
  return { kind: "search", values, salons: data };
}

export function salonsHead(data: SalonsPageData | undefined) {
  if (!data) return {};
  if (data.kind === "claim") {
    return seo({ title: `Claim ${data.page.salon.name}`, noindex: true });
  }
  if (data.kind === "salon") {
    const { salon } = data;
    const hiring = salon.liveJobs
      ? `Hiring now: ${salon.liveJobs} job${salon.liveJobs === 1 ? "" : "s"}.`
      : "";
    const about = salon.about ? ` ${salon.about.replace(/\s+/g, " ")}` : "";
    const description = `${salon.name}, a salon in ${salon.suburb} ${salon.state}. ${hiring}${about}`;
    return seo({
      title: `${salon.name}, ${salon.suburb} ${salon.state}`,
      description: description.length > 160 ? `${description.slice(0, 157)}…` : description,
      path: salon.path,
      noindex: data.noindex,
      image: salon.heroUrl ?? salon.logoUrl,
      jsonLd: [salonBusiness(salon, data.jobs), breadcrumbList(data.breadcrumbs)],
    });
  }
  if (data.kind === "search") {
    return seo({ title: "Search salons", path: "/salons", noindex: true });
  }
  const { salons } = data;
  return seo({
    title: salons.page > 1 ? `${data.heading} (page ${salons.page})` : data.heading,
    description: `${data.heading}: ${salons.total} salon${salons.total === 1 ? "" : "s"}, with the jobs they're hiring for.`,
    path: withPage(data.path, salons.page),
    noindex: data.noindex,
    jsonLd: [
      breadcrumbList(data.breadcrumbs),
      itemList(
        salons.items.map((salon) => salon.path),
        (salons.page - 1) * salons.pageSize,
      ),
    ],
  });
}

export function SalonsPage({
  data,
  claim,
}: {
  data: SalonsPageData;
  /** The claim page's content, given by the route (it needs who's signed in). */
  claim?: (page: SalonPage) => React.ReactNode;
}) {
  if (data.kind === "salon") return <SalonView page={data} />;
  if (data.kind === "claim") return <>{claim?.(data.page)}</>;
  if (data.kind === "search") return <SearchView data={data} />;
  return <LandingView landing={data} />;
}

function SalonSearch({ values = {} }: { values?: SalonSearchValues }) {
  const navigate = useNavigate();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const search: SalonSearchValues = {
      q: String(form.get("q") ?? "").trim() || undefined,
      hiring: form.get("hiring") === "on",
      ...nearFromForm(form),
    };
    const state = String(form.get("state") ?? "");
    if (!isSalonSearch(search)) {
      void navigate({ href: salonsLandingPath({ state: (state || undefined) as never }) });
      return;
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(salonSearchParams(search))) {
      if (value) params.set(key, value);
    }
    void navigate({ href: `/salons?${params}` });
  }
  return (
    <search>
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Input
            name="q"
            placeholder="Salon name, suburb or postcode"
            aria-label="Search"
            defaultValue={values.q}
          />
          <select name="state" aria-label="State" className={selectClass} defaultValue="">
            <option value="">All states</option>
            {AU_STATES.map((state) => (
              <option key={state.value} value={state.value}>
                {state.value}
              </option>
            ))}
          </select>
          <Button type="submit">Search</Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <NearMeFields values={values} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="hiring" defaultChecked={values.hiring} />
            Hiring now
          </label>
        </div>
      </form>
    </search>
  );
}

function LandingView({ landing }: { landing: SalonsLanding }) {
  const { salons } = landing;
  return (
    <Page width="wide" className="space-y-6">
      <div>
        <Breadcrumbs crumbs={landing.breadcrumbs} />
        <h1 className="font-semibold text-2xl tracking-tight">{landing.heading}</h1>
        <p className="mt-1 text-muted-foreground">
          {salons.total} salon{salons.total === 1 ? "" : "s"}. Salons that are hiring come first.
        </p>
      </div>
      <SalonSearch />
      {salons.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {salons.items.map((salon) => (
            <SalonCard key={salon.id} salon={salon} />
          ))}
        </div>
      ) : (
        <EmptyState title="No salons listed here yet" />
      )}
      <Pagination path={landing.path} page={salons.page} pageCount={salons.pageCount} />
      {!landing.state && (
        <Section title="Salons by state">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {AU_STATES.map((state) => (
              <li key={state.value}>
                <AppLink
                  href={salonsLandingPath({ state: state.value })}
                  className="hover:underline"
                >
                  Salons in {stateLabel(state.value)}
                </AppLink>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  );
}

function SearchView({ data }: { data: SalonsSearch }) {
  const { salons, values } = data;
  const found = [
    values.hiring ? "hiring now" : "",
    values.q ? `for "${values.q}"` : "",
    isNear(values) ? `${describeNear(values)}, nearest first` : "",
  ].filter(Boolean);
  return (
    <Page width="wide" className="space-y-6">
      <div>
        <Breadcrumbs crumbs={[{ name: "Salons", path: "/salons" }]} />
        <h1 className="font-semibold text-2xl tracking-tight">Search salons</h1>
        <p className="mt-1 text-muted-foreground">
          {salons.total} salon{salons.total === 1 ? "" : "s"} found {found.join(" ")}
        </p>
      </div>
      <SalonSearch values={values} />
      {salons.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {salons.items.map((salon) => (
            <SalonCard key={salon.id} salon={salon} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No salons match"
          description="Try a wider distance, a suburb or postcode, or another name."
        />
      )}
      <Pagination
        path="/salons"
        page={salons.page}
        pageCount={salons.pageCount}
        search={salonSearchParams(values)}
      />
    </Page>
  );
}

function SalonView({ page }: { page: SalonPage }) {
  const { salon, jobs } = page;
  const instagram = salon.instagram?.replace(/^@/, "");
  const contact = salon.contact;
  const hasContact = Boolean(contact?.phone || contact?.email || contact?.address);
  return (
    <Page width="wide" className="space-y-8">
      <Breadcrumbs crumbs={page.breadcrumbs} />
      <SalonHeader
        name={salon.name}
        logoUrl={salon.logoUrl}
        heroUrl={salon.heroUrl}
        actions={
          <>
            {salon.website && (
              <Button asChild variant="outline" size="sm">
                <a href={salon.website} rel="nofollow noopener" target="_blank">
                  <GlobeIcon />
                  Website
                </a>
              </Button>
            )}
            {instagram && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`https://www.instagram.com/${instagram}`}
                  rel="nofollow noopener"
                  target="_blank"
                >
                  <AtSignIcon />
                  {instagram}
                </a>
              </Button>
            )}
            {jobs.length > 0 && (
              <Button asChild size="sm">
                <a href="#jobs">
                  <BriefcaseIcon />
                  See {jobs.length === 1 ? "the job" : `${jobs.length} jobs`}
                </a>
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-sm">
          <span className="inline-flex items-center gap-1">
            <MapPinIcon className="size-4" />
            {salon.suburb} {salon.state} {salon.postcode}
          </span>
          {salon.verified && (
            <Badge variant="secondary">
              <BadgeCheckIcon />
              Verified business
            </Badge>
          )}
          {jobs.length > 0 && <Badge>Hiring now</Badge>}
        </div>
      </SalonHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          {salon.about && (
            <Section title={`About ${salon.name}`}>
              <p className="whitespace-pre-line text-pretty leading-relaxed">{salon.about}</p>
            </Section>
          )}
          <div id="jobs" className="scroll-mt-20">
            <Section
              title={jobs.length > 0 ? `Jobs at ${salon.name}` : "Jobs"}
              description={
                jobs.length > 0
                  ? `${jobs.length} open role${jobs.length === 1 ? "" : "s"}. Apply with your ${BRAND.name} profile.`
                  : undefined
              }
            >
              {jobs.length > 0 ? (
                <JobList jobs={jobs} />
              ) : (
                <EmptyState
                  title={`${salon.name} isn't hiring right now`}
                  description="Look at other salons nearby, or check back soon."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <AppLink href={page.breadcrumbs.at(-2)?.path ?? "/salons"}>
                        Salons in {salon.suburb}
                      </AppLink>
                    </Button>
                  }
                />
              )}
            </Section>
          </div>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {contact ? (
                <>
                  {contact.phone && (
                    <ContactLine icon={PhoneIcon}>
                      <a href={`tel:${contact.phone}`} className="hover:underline">
                        {contact.phone}
                      </a>
                    </ContactLine>
                  )}
                  {contact.email && (
                    <ContactLine icon={MailIcon}>
                      <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                        {contact.email}
                      </a>
                    </ContactLine>
                  )}
                  {contact.address && (
                    <ContactLine icon={MapPinIcon}>{contact.address}</ContactLine>
                  )}
                  {!hasContact && (
                    <p className="text-muted-foreground">No contact details listed.</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  <AppLink href={signInPath(salon.path)} className="underline">
                    Sign in
                  </AppLink>{" "}
                  to see contact details.
                </p>
              )}
              {salon.website && (
                <ContactLine icon={GlobeIcon}>
                  <a
                    href={salon.website}
                    rel="nofollow noopener"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    {salon.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </ContactLine>
              )}
            </CardContent>
          </Card>
          {page.claimable ? (
            <Card>
              <CardHeader>
                <CardTitle>Is this your business?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Claim it to add your photos and logo, and post jobs free for your first{" "}
                  {PRICING.freePeriodDays} days.
                </p>
                <Button asChild className="w-full">
                  <AppLink href={`${salon.path}/claim`}>Claim this business</AppLink>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="px-1 text-muted-foreground text-xs">
              Taken over this business?{" "}
              <AppLink href={`${salon.path}/claim`} className="underline">
                Claim it
              </AppLink>
            </p>
          )}
        </aside>
      </div>
    </Page>
  );
}

function ContactLine({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
