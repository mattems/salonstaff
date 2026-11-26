import { BRAND } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link, notFound, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { ContactActions } from "@/components/contact-actions";
import { selectClass } from "@/components/form";
import { Page } from "@/components/page";
import { ProfileView } from "@/components/profile-view";
import { api, type Schemas, unwrap } from "@/lib/api";
import { roleLabel } from "@/lib/format";
import { seo } from "@/lib/seo";
import { type Me, signInPath } from "@/lib/session";

/** A job seeker's share page (D-13): reached only by the link they posted, never indexed. */
export const Route = createFileRoute("/p/$code")({
  loader: async ({ params }) => {
    const result = await api.GET("/v1/profiles/{code}", {
      params: { path: { code: params.code } },
    });
    if (result.response.status === 404) throw notFound();
    return unwrap(result);
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return seo({ title: "Profile not found", noindex: true });
    const p = loaderData.profile;
    const roles = p.roles.map(roleLabel).join(", ");
    return seo({
      title: `${loaderData.name}${p.headline ? `: ${p.headline}` : ""}`,
      description: `${roles} in ${p.suburb} ${p.state}. See ${p.firstName}'s work, experience and endorsements on ${BRAND.name}.`,
      path: `/p/${params.code}`,
      image: p.photoUrl,
      ogType: "article",
      noindex: true,
    });
  },
  component: SharedProfile,
});

function SharedProfile() {
  const shared = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  return (
    <Page width="wide">
      <ProfileView full={shared} actions={<Reach shared={shared} me={me} />} />
    </Page>
  );
}

/** How the person looking can get in touch: only from a salon's team (D-13). */
function Reach({ shared, me }: { shared: Schemas["SharedProfile"]; me: Me | null }) {
  const { firstName } = shared.profile;
  const salons = shared.viewer?.salons ?? [];
  const [salonId, setSalonId] = useState(salons[0]?.id);
  // From the router, not `window`: the server renders this link too.
  const here = useLocation({ select: (location) => location.pathname });

  if (!shared.viewer) {
    if (me?.role === "seeker") return null;
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Hiring? Salons on {BRAND.name} can message {firstName} or ask for their number.
        </p>
        <div className="flex flex-wrap gap-2">
          {me ? (
            <Button asChild>
              <Link to="/employer/onboarding" search={{ next: here }}>
                Add your salon to contact {firstName}
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <a href={signInPath(here, "employer")}>Sign in or list your salon free</a>
            </Button>
          )}
        </div>
      </div>
    );
  }
  const chosen = salons.find((s) => s.id === salonId);
  if (!chosen) {
    return <p className="text-muted-foreground text-sm">You can't contact this person.</p>;
  }
  return (
    <div className="space-y-3">
      {salons.length > 1 && (
        <label className="flex max-w-sm items-center gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground">Contact as</span>
          <select
            className={selectClass}
            value={chosen.id}
            onChange={(event) => setSalonId(event.target.value)}
          >
            {salons.map((salon) => (
              <option key={salon.id} value={salon.id}>
                {salon.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <ContactActions
        key={chosen.id}
        salonId={chosen.id}
        salonName={chosen.name}
        candidateId={chosen.candidateId}
        firstName={firstName}
        contact={chosen.contact}
      />
      <Link
        to="/employer/$salonId/candidates/$id"
        params={{ salonId: chosen.id, id: chosen.candidateId }}
        className="text-sm underline"
      >
        See {firstName}'s full profile
      </Link>
    </div>
  );
}
