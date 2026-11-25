import { createFileRoute } from "@tanstack/react-router";
import { pageNumber } from "@/components/jobs-pages";
import { loadSalonsPath, SalonsPage, salonsHead, searchSalons } from "@/components/salons-pages";

/** /salons: the whole directory, or a search of it (`?q=`, not indexed). */
export const Route = createFileRoute("/salons/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string | undefined; page?: number | undefined } => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim().slice(0, 100) : undefined,
    page: pageNumber(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    deps.q ? searchSalons(deps.q, deps.page) : loadSalonsPath("/salons", deps.page),
  head: ({ loaderData }) => salonsHead(loaderData),
  component: SalonsIndex,
});

function SalonsIndex() {
  return <SalonsPage data={Route.useLoaderData()} />;
}
