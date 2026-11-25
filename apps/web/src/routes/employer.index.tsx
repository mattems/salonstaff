import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AppLink } from "@/components/app-link";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

/** Your salons (D-11). With none you start by adding one; with one you go straight to it. */
export const Route = createFileRoute("/employer/")({
  beforeLoad: ({ context }) => {
    const [only, ...more] = context.me.salons;
    if (!only) throw redirect({ to: "/employer/onboarding" });
    if (more.length === 0)
      throw redirect({ to: "/employer/$salonId", params: { salonId: only.id } });
  },
  loader: async () => unwrap(await api.GET("/v1/employer/salons")).items,
  head: () => privatePage("Your salons"),
  component: Salons,
});

const ROLE = { owner: "Owner", manager: "Manager" } as const;

function Salons() {
  const salons = Route.useLoaderData();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your salons"
        actions={
          <Button asChild>
            <Link to="/employer/onboarding">Add a salon</Link>
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {salons.map((salon) => (
          <Card key={salon.id} size="sm">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Link
                  to="/employer/$salonId"
                  params={{ salonId: salon.id }}
                  className="hover:underline"
                >
                  {salon.name}
                </Link>
                <Badge variant="outline">{ROLE[salon.role]}</Badge>
                {salon.status !== "active" && <Badge variant="destructive">{salon.status}</Badge>}
              </CardTitle>
              <CardDescription>
                {salon.suburb} {salon.state}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to="/employer/$salonId" params={{ salonId: salon.id }}>
                  Open
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        Already in the directory?{" "}
        <AppLink href="/salons" className="underline">
          Find your salon
        </AppLink>{" "}
        and claim it to add it here.
      </p>
    </div>
  );
}
