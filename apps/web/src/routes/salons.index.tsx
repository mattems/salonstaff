import { createFileRoute } from "@tanstack/react-router";
import { pageNumber } from "@/components/jobs-pages";
import { parseNear } from "@/components/near-me";
import {
  isSalonSearch,
  loadSalonsPath,
  type SalonSearchValues,
  SalonsPage,
  salonsHead,
  searchSalons,
} from "@/components/salons-pages";

/** /salons: the whole directory, or a search of it (`?q=`, `?hiring=true`, near me; not indexed). */
export const Route = createFileRoute("/salons/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): SalonSearchValues & { page?: number | undefined } => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim().slice(0, 100) : undefined,
    hiring: search.hiring === "true" || search.hiring === true ? true : undefined,
    ...parseNear(search),
    page: pageNumber(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    const { page, ...values } = deps;
    return isSalonSearch(values) ? searchSalons(values, page) : loadSalonsPath("/salons", page);
  },
  head: ({ loaderData }) => salonsHead(loaderData),
  component: SalonsIndex,
});

function SalonsIndex() {
  return <SalonsPage data={Route.useLoaderData()} />;
}
