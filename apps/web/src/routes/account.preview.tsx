import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedsProfile, useMyProfile } from "@/components/account-profile";
import { Notice } from "@/components/page";
import { ProfileView, viewable } from "@/components/profile-view";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/preview")({
  head: () => privatePage("Your profile as salons see it"),
  component: Preview,
});

const SEEN_BY = {
  public:
    "Salons see this, and anyone with your share link sees it without your surname, work rights or pay.",
  salons: "Salons on Salon Staff see this.",
  hidden: "Only salons you apply to see this.",
} as const;

function Preview() {
  const full = useMyProfile();
  if (!full) return <NeedsProfile />;
  const { firstName } = full.profile;
  const { contactBy, visibility, sharePath } = full.settings;
  return (
    <div className="space-y-6">
      <Notice title="This is how salons see you">
        {SEEN_BY[visibility]}{" "}
        <Link to="/account/sharing" className="underline">
          Change who sees it
        </Link>
        {sharePath && (
          <>
            {" or "}
            <a href={sharePath} target="_blank" rel="noreferrer" className="underline">
              open your share page
            </a>
          </>
        )}
        .
      </Notice>
      <ProfileView
        full={viewable(full)}
        actions={
          <div className="flex flex-wrap gap-2">
            {contactBy !== "phone" && <Button disabled>Contact {firstName}</Button>}
            {contactBy !== "email" && (
              <Button variant="outline" disabled>
                Show number
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
