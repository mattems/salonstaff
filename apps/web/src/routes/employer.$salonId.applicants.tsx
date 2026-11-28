import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateApplicantSearch } from "@/components/applicants";

/** Moved (D-20): applicants are on one page for all your salons, filtered to this one. */
export const Route = createFileRoute("/employer/$salonId/applicants")({
  validateSearch: validateApplicantSearch,
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/employer/applicants", search: { ...search, salon: params.salonId } });
  },
});
