import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api, unwrap } from "@/lib/api";

/**
 * One of your salons (D-11): its overview, team, billing and details, and its jobs, applications
 * and profiles opened from the lists across all your salons (D-20). The sidebar is the way
 * between them.
 */
export const Route = createFileRoute("/employer/$salonId")({
  beforeLoad: async ({ params }) => {
    const result = await api.GET("/v1/employer/salons/{salonId}", {
      params: { path: { salonId: params.salonId } },
    });
    // Not (or no longer) on its team: back to your salons.
    if (result.response.status === 404) throw redirect({ to: "/employer" });
    return { salon: unwrap(result) };
  },
  component: Outlet,
});
