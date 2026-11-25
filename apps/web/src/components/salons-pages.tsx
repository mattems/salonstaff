/**
 * The /salons pages (D-07): the directory by place, salon pages, and claiming a listing
 * (`{salon page}/claim`, D-04).
 */
import { AU_STATES, PRICING, salonsLandingPath } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { Input } from "@salonstaff/ui/components/input";
import { notFound, redirect, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { ApiProblem, api, type Schemas } from "@/lib/api";
import { stateLabel } from "@/lib/format";
import { breadcrumbList, itemList, seo, withPage } from "@/lib/seo";
import { signInPath } from "@/lib/session";
import { salonBusiness } from "@/lib/structured-data";
import { AppLink } from "./app-link";
import { selectClass } from "./form";
import { Breadcrumbs, JobList, Pagination, SalonCard } from "./listing";
import { EmptyState, Page, Section } from "./page";

export type SalonsLanding = Extract<Schemas["SalonsPath"], { kind: "landing" }>;
export type SalonPage = Extract<Schemas["SalonsPath"], { kind: "salon" }>;
export type SalonsSearch = { kind: "search"; q: string; salons: Schemas["SalonList"] };
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

export async function searchSalons(q: string, page = 1): Promise<SalonsSearch> {
  const { data, error, response } = await api.GET("/v1/salons", {
    params: { query: { q, page } },
  });
  if (!data) throw new ApiProblem(response.status, error);
  return { kind: "search", q, salons: data };
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
      image: salon.logoUrl,
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

function SalonSearch({ q }: { q?: string }) {
  const navigate = useNavigate();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get("q") ?? "").trim();
    const state = String(form.get("state") ?? "");
    void navigate({
      href: text
        ? `/salons?q=${encodeURIComponent(text)}`
        : salonsLandingPath({ state: (state || undefined) as never }),
    });
  }
  return (
    <search>
      <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input
          name="q"
          placeholder="Salon name, suburb or postcode"
          aria-label="Search"
          defaultValue={q}
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
  const { salons } = data;
  return (
    <Page width="wide" className="space-y-6">
      <div>
        <Breadcrumbs crumbs={[{ name: "Salons", path: "/salons" }]} />
        <h1 className="font-semibold text-2xl tracking-tight">Search salons</h1>
        <p className="mt-1 text-muted-foreground">
          {salons.total} salon{salons.total === 1 ? "" : "s"} found for "{data.q}"
        </p>
      </div>
      <SalonSearch q={data.q} />
      {salons.items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {salons.items.map((salon) => (
            <SalonCard key={salon.id} salon={salon} />
          ))}
        </div>
      ) : (
        <EmptyState title="No salons match" description="Try a suburb, postcode or another name." />
      )}
      <Pagination
        path="/salons"
        page={salons.page}
        pageCount={salons.pageCount}
        search={{ q: data.q }}
      />
    </Page>
  );
}

function SalonView({ page }: { page: SalonPage }) {
  const { salon, jobs } = page;
  return (
    <Page width="wide">
      <Breadcrumbs crumbs={page.breadcrumbs} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <header className="flex items-start gap-4">
            {salon.logoUrl && (
              <img src={salon.logoUrl} alt="" className="size-16 rounded-lg border object-cover" />
            )}
            <div className="space-y-1">
              <h1 className="font-semibold text-2xl tracking-tight">{salon.name}</h1>
              <p className="text-muted-foreground">
                {salon.suburb} {salon.state} {salon.postcode}
              </p>
              <div className="flex flex-wrap gap-2">
                {salon.verified && <Badge variant="secondary">Verified business</Badge>}
                {!salon.claimed && <Badge variant="outline">Unclaimed listing</Badge>}
              </div>
            </div>
          </header>
          {salon.about && (
            <Section title="About">
              <p className="whitespace-pre-line leading-relaxed">{salon.about}</p>
            </Section>
          )}
          <Section title={jobs.length > 0 ? `Jobs at ${salon.name}` : "Jobs"}>
            {jobs.length > 0 ? (
              <JobList jobs={jobs} />
            ) : (
              <p className="text-muted-foreground text-sm">{salon.name} isn't hiring right now.</p>
            )}
          </Section>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {salon.website && (
                <p>
                  <a
                    href={salon.website}
                    rel="nofollow noopener"
                    target="_blank"
                    className="underline"
                  >
                    Website
                  </a>
                </p>
              )}
              {salon.instagram && (
                <p>
                  <a
                    href={`https://www.instagram.com/${salon.instagram.replace(/^@/, "")}`}
                    rel="nofollow noopener"
                    target="_blank"
                    className="underline"
                  >
                    @{salon.instagram.replace(/^@/, "")}
                  </a>
                </p>
              )}
              {salon.contact ? (
                <>
                  {salon.contact.phone && (
                    <p>
                      Phone: <a href={`tel:${salon.contact.phone}`}>{salon.contact.phone}</a>
                    </p>
                  )}
                  {salon.contact.email && (
                    <p>
                      Email: <a href={`mailto:${salon.contact.email}`}>{salon.contact.email}</a>
                    </p>
                  )}
                  {salon.contact.address && <p>{salon.contact.address}</p>}
                  {!salon.contact.phone && !salon.contact.email && !salon.contact.address && (
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
            </CardContent>
          </Card>
          {page.claimable && (
            <Card>
              <CardHeader>
                <CardTitle>Is this your business?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Claim this listing to manage it and post jobs, free for your first{" "}
                  {PRICING.freePeriodDays} days.
                </p>
                <Button asChild className="w-full">
                  <AppLink href={`${salon.path}/claim`}>Claim this business</AppLink>
                </Button>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </Page>
  );
}
