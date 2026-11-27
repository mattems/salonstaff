import { CONTACT_BY } from "@salonstaff/shared";
import { Label } from "@salonstaff/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@salonstaff/ui/components/radio-group";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NeedsProfile, SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import { localMobile } from "@/components/account-security";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { api, type Schemas, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/contact")({
  head: () => privatePage("How salons contact you"),
  component: Contact,
});

const DESCRIPTIONS: Record<Schemas["ProfileSettings"]["contactBy"], string> = {
  both: "Salons can message you on Salon Staff and see your mobile.",
  email:
    "Salons can message you on Salon Staff. You reply in your inbox; they never see your email.",
  phone:
    "Salons can see your mobile and call or text you. Salons you apply to can still message you about it.",
};

function Contact() {
  const full = useMyProfile();
  const { me } = Route.useRouteContext();
  const refresh = useRefresh();
  const action = useAction();
  if (!full) return <NeedsProfile />;
  /** What the account lacks for an option: "an email", "a mobile", or both. */
  const needs = (value: string) =>
    [value !== "email" && !me.phoneNumber && "a mobile"].filter(Boolean);
  const missing = (value: string) => needs(value).length > 0;

  return (
    <div className="space-y-6">
      <SectionCard
        title="How salons contact you"
        description="Only people signed in on a salon's team can contact you, and only if they can see your profile."
        footer={
          <p className="pb-4">
            Messages arrive in your{" "}
            <Link to="/inbox" className="underline">
              inbox
            </Link>
            , and we tell you by email (and on your phone, with the app). Salons who look see{" "}
            <strong>{me.phoneNumber ? localMobile(me.phoneNumber) : "no mobile yet"}</strong>.{" "}
            <Link to="/account/security" className="underline">
              Change it
            </Link>
          </p>
        }
      >
        <form
          className="space-y-4"
          onSubmit={action.submit(async (form) => {
            const contactBy = String(
              form.get("contactBy"),
            ) as Schemas["ProfileSettings"]["contactBy"];
            unwrap(await api.PATCH("/v1/me/profile/settings", { body: { contactBy } }));
            await refresh("Saved");
          })}
        >
          <RadioGroup name="contactBy" defaultValue={full.settings.contactBy} className="gap-3">
            {CONTACT_BY.map((option) => (
              <Label
                key={option.value}
                htmlFor={`contact-${option.value}`}
                className="flex items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem
                  id={`contact-${option.value}`}
                  value={option.value}
                  disabled={missing(option.value)}
                  className="mt-0.5"
                />
                <span className="space-y-1">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-muted-foreground text-sm">
                    {missing(option.value)
                      ? `Add ${needs(option.value).join(" and ")} to your account first.`
                      : DESCRIPTIONS[option.value]}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <FormMessage message={action.errors.contactBy ?? action.message} />
          <SubmitButton pending={action.pending}>Save</SubmitButton>
        </form>
      </SectionCard>
      <p className="text-muted-foreground text-sm">
        Salons that messaged you or looked at your number are in your{" "}
        <Link to="/inbox" className="underline">
          inbox
        </Link>
        .
      </p>
    </div>
  );
}
