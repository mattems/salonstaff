import { createFileRoute } from "@tanstack/react-router";
import { ClaimView } from "@/components/claim";
import { type PageSearch, pageNumber } from "@/components/jobs-pages";
import { loadClaimPage, loadSalonsPath, SalonsPage, salonsHead } from "@/components/salons-pages";

const CLAIM = "claim";

/** /salons/{state}/{suburb}/{salon}[/claim]: the directory by place, salon pages and claims. */
export const Route = createFileRoute("/salons/$")({
  validateSearch: (search: Record<string, unknown>): PageSearch => ({
    page: pageNumber(search.page),
  }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ params, deps }) => {
    const segments = (params._splat ?? "").split("/").filter(Boolean);
    if (segments.length === 4 && segments[3] === CLAIM) {
      // The claim itself (its options and where yours stands) is read by the page.
      return loadClaimPage(`/salons/${segments.slice(0, 3).join("/")}`);
    }
    return loadSalonsPath(`/salons/${segments.join("/")}`, deps.page);
  },
  head: ({ loaderData }) => salonsHead(loaderData),
  component: SalonsSplat,
});

function SalonsSplat() {
  const data = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  return <SalonsPage data={data} claim={(page) => <ClaimView page={page} me={me} />} />;
}
