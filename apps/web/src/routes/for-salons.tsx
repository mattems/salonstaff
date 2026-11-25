import { PRICING } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, PageHeader, Section } from "@/components/page";
import { dollars } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/for-salons")({
  head: () =>
    seo({
      title: "For salons: post hair and beauty jobs",
      description: `Post hair and beauty jobs free for your first ${PRICING.freePeriodDays} days. Then ${dollars(PRICING.singleListingCents)} a listing, or unlimited listings with the Salon Plan.`,
      path: "/for-salons",
    }),
  component: ForSalons,
});

function ForSalons() {
  return (
    <Page className="space-y-10">
      <PageHeader
        title="Hire hair and beauty staff"
        description="Post a job in a few minutes. Applicants send their profile, verification and contact details."
      />

      <Section title="How it works">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sign in and add your salon with its ABN, or claim your listing in the directory.</li>
          <li>Post a job. It goes live straight away on its own page.</li>
          <li>Review applicants, shortlist them and contact them directly.</li>
        </ol>
      </Section>

      <Section title="Pricing" description="All prices in Australian dollars, GST included.">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Launch offer</CardTitle>
              <CardDescription>For every new or claimed salon</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-2xl">Free</p>
              <p className="text-muted-foreground">
                Unlimited listings for {PRICING.freePeriodDays} days
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Single listing</CardTitle>
              <CardDescription>One job</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-2xl">{dollars(PRICING.singleListingCents)}</p>
              <p className="text-muted-foreground">Live for {PRICING.listingDurationDays} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Salon Plan</CardTitle>
              <CardDescription>Unlimited listings</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-semibold text-2xl">
                {dollars(PRICING.salonPlanMonthlyCents)}
                <span className="font-normal text-base text-muted-foreground"> a month</span>
              </p>
              <p className="text-muted-foreground">
                The first {PRICING.foundingSalonLimit} salons keep a founding price of{" "}
                {dollars(PRICING.foundingPlanMonthlyCents)} a month.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/sign-in" search={{ as: "employer", next: "/employer" }}>
            Post your first job free
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/salons">Find your salon in the directory</Link>
        </Button>
      </div>
    </Page>
  );
}
