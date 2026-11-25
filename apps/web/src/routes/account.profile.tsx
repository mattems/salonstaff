import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, Notice } from "@/components/page";
import { ProfileView } from "@/components/profile-view";
import { api, orNull } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/profile")({
  loader: async () => {
    const full = orNull(await api.GET("/v1/me/profile"));
    return { full };
  },
  head: () => privatePage("Your profile as salons see it"),
  component: Preview,
});

function Preview() {
  const { full } = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  if (!full) {
    return (
      <EmptyState
        title="No profile yet"
        description="Make your profile to see it the way salons will."
        action={
          <Button asChild>
            <Link to="/account" search={{}}>
              Make your profile
            </Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      <Notice title="This is how salons see you">
        Salons see your profile, verification and contact details when you apply for one of their
        jobs.
      </Notice>
      <ProfileView full={full} contact={{ email: me.email, phone: me.phoneNumber }} />
    </div>
  );
}
