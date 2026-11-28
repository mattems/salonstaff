import { BRAND, PRICING, postcodeSchema } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { cn } from "@salonstaff/ui/lib/utils";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppLink } from "@/components/app-link";
import { type ClaimedSalon, ClaimFlow } from "@/components/claim-flow";
import { readSalonForm, SalonFields } from "@/components/employer";
import { FormMessage, parse, SubmitButton, TextField, useAction } from "@/components/form";
import { Notice, PageHeader } from "@/components/page";
import { SalonLogo } from "@/components/salon-brand";
import { SalonPictures } from "@/components/salon-pictures";
import { api, type Schemas, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe, safeNext } from "@/lib/session";

interface OnboardingSearch {
  next?: string | undefined;
  /** A salon just claimed from its listing's claim page: straight to its pictures. */
  claimed?: string | undefined;
}

/**
 * Adding a salon (D-22), as a few steps: what it's called and where, then either claiming the
 * listing that's already in the directory or entering a new salon's details, then its logo and
 * cover photo.
 */
export const Route = createFileRoute("/employer/onboarding")({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => ({
    next: safeNext(search.next),
    claimed:
      typeof search.claimed === "string" && /^sln_[a-z0-9]{1,40}$/.test(search.claimed)
        ? search.claimed
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ claimed: search.claimed }),
  loader: async ({ deps }) =>
    deps.claimed
      ? unwrap(
          await api.GET("/v1/employer/salons/{salonId}", {
            params: { path: { salonId: deps.claimed } },
          }),
        )
      : null,
  head: () => privatePage("Add a salon"),
  component: Onboarding,
});

type Match = Schemas["SalonMatch"];
interface Query {
  name: string;
  postcode: string;
}
/** The listing being claimed: a match, or the one an ABN turned out to belong to. */
interface Listing {
  id: string;
  name: string;
  suburb: string;
  state: string;
  postcode: string;
  logoUrl: string | null;
}

type Step =
  | { kind: "find"; query?: Query }
  | { kind: "matches"; query: Query; matches: Match[] }
  | { kind: "claim"; query: Query | undefined; listing: Listing; back: Step }
  | { kind: "details"; query: Query | undefined; back: Step }
  | { kind: "pictures"; salon: ClaimedSalon; claimed: boolean };

const STEPS = ["Find your salon", "Confirm or add it", "Add your photos"] as const;
const stepIndex = (step: Step) =>
  step.kind === "find" || step.kind === "matches" ? 0 : step.kind === "pictures" ? 2 : 1;

const findSchema = z.object({
  name: z.string().trim().min(2, "Enter your salon's name").max(120),
  postcode: postcodeSchema,
});

function Onboarding() {
  const { me } = Route.useRouteContext();
  const claimed = Route.useLoaderData();
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    claimed ? { kind: "pictures", salon: claimed, claimed: true } : { kind: "find" },
  );
  const first = me.salons.length === 0;

  async function finish(salonId: string) {
    forgetMe();
    if (next) await navigate({ href: next });
    else await navigate({ to: "/employer/$salonId", params: { salonId } });
    await router.invalidate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={first ? "Add your salon" : "Add another salon"}
        description={
          first
            ? `List jobs free for your first ${PRICING.freePeriodDays} days. The first ${PRICING.foundingSalonLimit} salons keep founding pricing.`
            : "Each location is a salon with its own page. Its jobs, applicants and messages join your others here."
        }
      />
      <Progress current={stepIndex(step)} />
      {next && step.kind !== "pictures" && (
        <Notice title="Then back to where you were">
          Once your salon is added, we'll take you straight back so you can get in touch.
        </Notice>
      )}

      {step.kind === "find" && (
        <FindStep
          query={step.query}
          onFound={(query, matches) =>
            setStep(
              matches.length > 0
                ? { kind: "matches", query, matches }
                : { kind: "details", query, back: { kind: "find", query } },
            )
          }
        />
      )}

      {step.kind === "matches" && (
        <MatchesStep
          query={step.query}
          matches={step.matches}
          onBack={() => setStep({ kind: "find", query: step.query })}
          onPick={(listing) => setStep({ kind: "claim", query: step.query, listing, back: step })}
          onNew={() => setStep({ kind: "details", query: step.query, back: step })}
        />
      )}

      {step.kind === "claim" && (
        <StepCard
          title={`Confirm you run ${step.listing.name}`}
          description="Salons on Salon Staff are run by the people who own them. Prove it's yours and it's in your salons straight away."
          onBack={() => setStep(step.back)}
        >
          <ListingLine listing={step.listing} />
          <ClaimFlow
            key={step.listing.id}
            salonId={step.listing.id}
            salonName={step.listing.name}
            me={me}
            onClaimed={(salon) => setStep({ kind: "pictures", salon, claimed: true })}
          />
        </StepCard>
      )}

      {step.kind === "details" && (
        <DetailsStep
          query={step.query}
          me={me}
          noMatches={step.back.kind === "find"}
          onBack={() => setStep(step.back)}
          onListed={(listing) => setStep({ kind: "claim", query: step.query, listing, back: step })}
          onCreated={(salon) => setStep({ kind: "pictures", salon, claimed: false })}
        />
      )}

      {step.kind === "pictures" && (
        <StepCard
          title={step.claimed ? `${step.salon.name} is yours` : `${step.salon.name} is set up`}
          description="Now make its page look like you. Salons with a cover photo and logo stand out to job seekers. You can change them any time under Salon details."
        >
          <SalonPictures salon={step.salon} onChange={(salon) => setStep({ ...step, salon })} />
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button onClick={() => void finish(step.salon.id)}>
              {step.salon.logoUrl || step.salon.heroUrl ? "Done" : "Skip for now"}
            </Button>
            <AppLink
              href={step.salon.path}
              target="_blank"
              className="text-muted-foreground text-sm underline"
            >
              See its page
            </AppLink>
          </div>
        </StepCard>
      )}
    </div>
  );
}

function Progress({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === current ? "step" : undefined} className="space-y-2">
          <div className={cn("h-1 rounded-full", i <= current ? "bg-primary" : "bg-muted")} />
          <p
            className={cn(
              "flex items-center gap-1 text-xs",
              i === current ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {i < current && <CheckIcon className="size-3" />}
            <span className="hidden sm:inline">{i + 1}. </span>
            {label}
          </p>
        </li>
      ))}
    </ol>
  );
}

function StepCard({
  title,
  description,
  onBack,
  children,
}: {
  title: string;
  description?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 w-fit text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeftIcon />
            Back
          </Button>
        )}
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

function ListingLine({ listing }: { listing: Listing }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <SalonLogo name={listing.name} logoUrl={listing.logoUrl} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-medium">{listing.name}</p>
        <p className="text-muted-foreground text-sm">
          {listing.suburb} {listing.state} {listing.postcode}
        </p>
      </div>
    </div>
  );
}

function FindStep({
  query,
  onFound,
}: {
  query: Query | undefined;
  onFound: (query: Query, matches: Match[]) => void;
}) {
  const action = useAction();
  return (
    <StepCard
      title="What's your salon called?"
      description={`Most salons are already in the ${BRAND.name} directory. We'll look for yours, so you can claim it rather than start from scratch.`}
    >
      <form
        className="space-y-4"
        onSubmit={action.submit(async (form) => {
          const found = parse(findSchema, {
            name: String(form.get("name") ?? ""),
            postcode: String(form.get("postcode") ?? ""),
          });
          const { items } = unwrap(
            await api.GET("/v1/salons/matches", { params: { query: found } }),
          );
          onFound(found, items);
        })}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <TextField
            label="Salon name"
            name="name"
            required
            defaultValue={query?.name}
            placeholder="Bella Rosa Hair"
            autoFocus
            error={action.errors.name}
          />
          <TextField
            label="Postcode"
            name="postcode"
            inputMode="numeric"
            maxLength={4}
            required
            defaultValue={query?.postcode}
            placeholder="3065"
            error={action.errors.postcode}
          />
        </div>
        <FormMessage message={action.message} />
        <SubmitButton pending={action.pending}>
          <SearchIcon />
          Find my salon
        </SubmitButton>
      </form>
    </StepCard>
  );
}

function MatchesStep({
  query,
  matches,
  onBack,
  onPick,
  onNew,
}: {
  query: Query;
  matches: Match[];
  onBack: () => void;
  onPick: (listing: Listing) => void;
  onNew: () => void;
}) {
  return (
    <StepCard
      title={matches.length === 1 ? "Is this your salon?" : "Is one of these your salon?"}
      description={`Listed salons near ${query.postcode} with a name like "${query.name}".`}
      onBack={onBack}
    >
      <ul className="space-y-2">
        {matches.map((match) => (
          <li
            key={match.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-3 sm:flex-nowrap"
          >
            <SalonLogo name={match.name} logoUrl={match.logoUrl} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium">{match.name}</p>
              <p className="text-muted-foreground text-sm">
                {match.suburb} {match.state} {match.postcode}
                {match.distanceKm !== null &&
                  match.distanceKm > 0 &&
                  ` · ${match.distanceKm} km away`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {match.yourRole === "owner" && <Badge>You own this</Badge>}
                {match.yourRole === "manager" && <Badge variant="secondary">You manage this</Badge>}
                {!match.yourRole && match.claimed && (
                  <Badge variant="outline">Already managed on {BRAND.name}</Badge>
                )}
                {match.verified && <Badge variant="outline">Verified business</Badge>}
              </div>
            </div>
            {match.yourRole === "owner" ? (
              <Button asChild variant="outline" size="sm">
                <AppLink href={`/employer/${match.id}`}>Open</AppLink>
              </Button>
            ) : (
              <Button size="sm" onClick={() => onPick(match)}>
                This is mine
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-start gap-2 border-t pt-4">
        <p className="text-muted-foreground text-sm">Not listed here?</p>
        <Button variant="outline" onClick={onNew}>
          <PlusIcon />
          Add {query.name} as a new salon
        </Button>
      </div>
    </StepCard>
  );
}

/** The API's 409 names the listing to claim when the ABN is already in the directory. */
const claimPathIn = (hint: string | undefined) =>
  hint?.match(/(\/salons\/[a-z0-9/-]+)\/claim\b/)?.[1];

function DetailsStep({
  query,
  me,
  noMatches,
  onBack,
  onListed,
  onCreated,
}: {
  query: Query | undefined;
  me: Schemas["Me"];
  /** We looked and found nothing like it. */
  noMatches: boolean;
  onBack: () => void;
  onListed: (listing: Listing) => void;
  onCreated: (salon: ClaimedSalon) => void;
}) {
  const action = useAction();
  const [listed, setListed] = useState<Listing | null>(null);
  return (
    <StepCard
      title="Your salon's details"
      description={
        noMatches
          ? `We couldn't find ${query?.name ?? "it"} in the directory, so let's add it. This is what job seekers see.`
          : "This is what job seekers see on its page and its jobs."
      }
      onBack={onBack}
    >
      {listed ? (
        <div className="space-y-4">
          <Notice title="That business is already listed">
            The ABN belongs to a salon in our directory. Claim it instead of adding it again: its
            page, address and history stay.
          </Notice>
          <ListingLine listing={listed} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onListed(listed)}>Claim {listed.name}</Button>
            <Button variant="ghost" onClick={() => setListed(null)}>
              Check the ABN
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={action.submit(async (form) => {
            const body = readSalonForm(form);
            const { data, error, response } = await api.POST("/v1/employer/salons", { body });
            if (response.status === 409) {
              const path = claimPathIn((error as { hint?: string } | undefined)?.hint);
              const page = path
                ? (await api.GET("/v1/salons/by-path", { params: { query: { path } } })).data
                : undefined;
              if (page?.kind === "salon") {
                setListed(page.salon);
                return;
              }
            }
            const salon = unwrap({ data, error, response });
            forgetMe();
            toast.success(`${salon.name} is set up`);
            onCreated(salon);
          })}
        >
          <SalonFields
            salon={{
              name: query?.name,
              postcode: query?.postcode,
              contactName: me.name,
              phone: me.phoneNumber,
            }}
            errors={action.errors}
          />
          <FormMessage message={action.message} />
          <SubmitButton pending={action.pending}>Add this salon</SubmitButton>
        </form>
      )}
    </StepCard>
  );
}
