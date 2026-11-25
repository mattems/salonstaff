import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MockPage, requireLocal } from "@/components/dev-mock";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe, safeNext } from "@/lib/session";

interface MockSearch {
  ref?: string | undefined;
  return?: string | undefined;
}

/** Local only: stands in for Stripe Identity's pages. */
export const Route = createFileRoute("/dev/mock-identity")({
  validateSearch: (search: Record<string, unknown>): MockSearch => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
    return: typeof search.return === "string" ? search.return : undefined,
  }),
  loader: requireLocal,
  head: () => privatePage("Mock identity check"),
  component: MockIdentity,
});

function MockIdentity() {
  const { ref, return: back } = Route.useSearch();
  const navigate = useNavigate();
  const finish = (outcome: "verified" | "failed") => async () => {
    unwrap(
      await api.POST("/v1/dev/identity/{ref}", {
        params: { path: { ref: ref ?? "" } },
        body: { outcome },
      }),
    );
    forgetMe();
    // Back where the check started: a page on this site, or the mobile app (the API allowed it).
    if (back?.startsWith("salonstaff://")) {
      window.location.href = back;
      return;
    }
    const url = back ? new URL(back, window.location.origin) : null;
    const here = url?.origin === window.location.origin ? safeNext(url.pathname) : undefined;
    await navigate({ href: here ?? "/account/verify" });
  };
  return (
    <MockPage
      title="Mock identity check"
      description={`Local stand-in for Stripe Identity (reference ${ref ?? "missing"}). Pass gives the check the profile's own name.`}
      choices={[
        { label: "Pass", primary: true, run: finish("verified") },
        { label: "Fail", run: finish("failed") },
      ]}
    />
  );
}
