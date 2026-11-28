import { createFileRoute, redirect } from "@tanstack/react-router";

/** Moved (D-20): you post a job from one page and choose the salon there. */
export const Route = createFileRoute("/employer/$salonId/jobs/new")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/employer/jobs/new", search: { salon: params.salonId } });
  },
});
