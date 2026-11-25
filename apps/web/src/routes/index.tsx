import { BRAND, PRICING } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { JobSearch } from "@/components/job-search";
import { JobList } from "@/components/listing";
import { EmptyState, Page, Section } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { absolute, seo } from "@/lib/seo";

export const Route = createFileRoute("/")({
  loader: async () => unwrap(await api.GET("/v1/jobs", { params: { query: { page: 1 } } })),
  head: () =>
    seo({
      title: `${BRAND.name}: hair and beauty jobs in Australia`,
      description:
        "Find hair and beauty jobs across Australia: stylists, colourists, barbers, beauty therapists, nail and lash technicians. One profile to apply; salons post jobs free during launch.",
      path: "/",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: BRAND.name,
          url: absolute("/"),
        },
      ],
    }),
  component: Home,
});

function Home() {
  const jobs = Route.useLoaderData();
  return (
    <Page width="wide" className="space-y-10">
      <section className="space-y-4">
        <h1 className="font-semibold text-3xl tracking-tight">Hair and beauty jobs in Australia</h1>
        <p className="max-w-2xl text-muted-foreground">
          Jobs from salons across Australia, and a directory of the salons themselves. Make one
          profile and apply in a few clicks.
        </p>
        <JobSearch />
        <p className="text-muted-foreground text-sm">
          {jobs.total} live job{jobs.total === 1 ? "" : "s"} right now
        </p>
      </section>

      <Section title="Latest jobs">
        {jobs.items.length > 0 ? (
          <JobList jobs={jobs.items.slice(0, 6)} />
        ) : (
          <EmptyState title="No jobs yet" description="New jobs appear here as salons post them." />
        )}
        <Button asChild variant="outline">
          <Link to="/jobs">See all jobs</Link>
        </Button>
      </Section>

      <Section
        title="Hiring?"
        description={`Salons list jobs free for their first ${PRICING.freePeriodDays} days. After that it's $${PRICING.singleListingCents / 100} a listing, or unlimited with the Salon Plan.`}
      >
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/sign-in" search={{ as: "employer", next: "/employer" }}>
              Post a job
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/for-salons">How it works</Link>
          </Button>
        </div>
      </Section>
    </Page>
  );
}
