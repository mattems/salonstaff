import { createFileRoute } from "@tanstack/react-router";
import { SectionCard } from "@/components/account-profile";
import { AccountSecurity, loadAccountSecurity } from "@/components/account-security";
import { DeleteAccountButton } from "@/components/delete-account";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/security")({
  loader: () => loadAccountSecurity(),
  head: () => privatePage("Sign-in and security"),
  component: Security,
});

function Security() {
  const security = Route.useLoaderData();
  return (
    <div className="space-y-6">
      <AccountSecurity {...security} />
      <SectionCard
        title="Delete your account"
        description="Deletes your account, profile, photos, endorsements, applications and checks, and signs you out everywhere. This can't be undone."
      >
        <DeleteAccountButton warning="Everything goes: your profile, photos, endorsements, applications and verification. Salons you applied to lose your details. This can't be undone." />
      </SectionCard>
    </div>
  );
}
