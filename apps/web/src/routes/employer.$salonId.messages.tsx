import { createFileRoute, redirect } from "@tanstack/react-router";

/** Moved (D-20): messages are on one page for all your salons. Old links (emails) still work. */
export const Route = createFileRoute("/employer/$salonId/messages")({
  validateSearch: (search: Record<string, unknown>): { with?: string | undefined } => ({
    with: typeof search.with === "string" ? search.with : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/employer/messages",
      search: { salon: params.salonId, with: search.with },
    });
  },
});
