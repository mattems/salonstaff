/**
 * What the job seeker's account sections share: their profile (loaded once by the /account
 * layout), refreshing after a change, a section's card, and the profile strength meter.
 */
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { Progress } from "@salonstaff/ui/components/progress";
import { getRouteApi, Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page";
import type { Schemas } from "@/lib/api";
import { forgetMe } from "@/lib/session";

export type MyProfile = Schemas["MyProfile"];

const accountRoute = getRouteApi("/account");

/** Their profile, or null before they've saved their basics. */
export function useMyProfile(): MyProfile | null {
  return accountRoute.useLoaderData().profile;
}

/** Reloads the account's data after a change, with an optional toast. */
export function useRefresh() {
  const router = useRouter();
  return async (message?: string) => {
    if (message) toast.success(message);
    forgetMe();
    await router.invalidate();
  };
}

export function SectionCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <div className="border-t px-6 pt-4 text-muted-foreground text-sm">{footer}</div>}
    </Card>
  );
}

/** Shown in a section that needs a profile, before they've made one. */
export function NeedsProfile() {
  return (
    <EmptyState
      title="Start with your basics"
      description="Save your name, location and roles first. Then you can add the rest."
      action={
        <Button asChild>
          <Link to="/account" search={{}}>
            Add your basics
          </Link>
        </Button>
      }
    />
  );
}

export function strengthOf(full: MyProfile) {
  const { profile: p } = full;
  const parts: [string, number, boolean][] = [
    ["Your basics", 20, true],
    ["A profile photo", 10, Boolean(p.photoUrl)],
    ["A headline and a few words about you", 10, Boolean(p.headline && p.about)],
    ["Your specialties", 10, p.specialties.length > 0],
    ["When you can work", 5, p.availableDays.length > 0 || p.employmentTypes.length > 0],
    ["Your pay", 5, p.payMin !== null],
    ["At least 3 portfolio photos", 15, full.portfolio.length >= 3],
    ["Your experience", 10, full.experience.length > 0],
    ["An endorsement", 5, full.endorsements.length > 0],
    ["A verified identity", 10, full.verification.identity === "verified"],
  ];
  const score = parts.reduce((sum, [, points, done]) => sum + (done ? points : 0), 0);
  return { score, missing: parts.filter(([, , done]) => !done).map(([label]) => label) };
}

export function Strength({ full }: { full: MyProfile }) {
  const { score, missing } = strengthOf(full);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Profile strength</span>
        <span className="text-muted-foreground">{score}%</span>
      </div>
      <Progress value={score} aria-label="Profile strength" />
      {missing.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Still to add: {missing.join(", ").toLowerCase()}.
        </p>
      )}
    </div>
  );
}
