import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/page";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () =>
    seo({
      title: "Privacy",
      description:
        "How Salon Staff handles your data: identity checks, work rights, qualifications and your profile.",
      path: "/privacy",
    }),
  component: Privacy,
});

// A draft: to be reviewed against the Privacy Act 1988 (APPs) before launch.
function Privacy() {
  return (
    <Page width="narrow">
      <PageHeader title="Privacy" description="Draft: to be finalised before launch." />
      <div className="space-y-4 leading-relaxed">
        <p>
          Salon Staff verifies job seekers so salons can trust who they're hiring. Here's what that
          means for your data.
        </p>
        <p>
          <strong>Identity checks</strong> are performed by our verification provider. We receive
          the outcome and the name on your ID. We do not store images of your ID or selfie.
        </p>
        <p>
          <strong>Work rights</strong> are checked with your consent. Salons see the result (for
          example “Work rights verified”), not your visa details.
        </p>
        <p>
          <strong>Qualification documents</strong> you upload are stored privately and only viewed
          by our review team.
        </p>
        <p>
          <strong>Your profile</strong> is shared with salons you apply to. You can delete your
          account and all associated data at any time from your profile page or the app.
        </p>
      </div>
    </Page>
  );
}
