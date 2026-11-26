import { CONTACT_BY } from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import { Label } from "@salonstaff/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@salonstaff/ui/components/radio-group";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { NeedsProfile, SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import { localMobile } from "@/components/account-security";
import { AppLink } from "@/components/app-link";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { ago } from "@/lib/format";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/contact")({
  loader: async () => unwrap(await api.GET("/v1/me/profile/contacts")),
  head: () => privatePage("How salons contact you"),
  component: Contact,
});

const DESCRIPTIONS: Record<Schemas["ProfileSettings"]["contactBy"], string> = {
  both: "Salons can send you a message and see your mobile.",
  email:
    "Salons send you a message, which we email to you. They don't see your address until you reply.",
  phone: "Salons can see your mobile and call or text you.",
};

function Contact() {
  const full = useMyProfile();
  const { me } = Route.useRouteContext();
  const { items } = Route.useLoaderData();
  const refresh = useRefresh();
  const action = useAction();
  if (!full) return <NeedsProfile />;
  /** What the account lacks for an option: "an email", "a mobile", or both. */
  const needs = (value: string) =>
    [
      value !== "phone" && !me.email && "an email",
      value !== "email" && !me.phoneNumber && "a mobile",
    ].filter(Boolean);
  const missing = (value: string) => needs(value).length > 0;

  return (
    <div className="space-y-6">
      <SectionCard
        title="How salons contact you"
        description="Only people signed in on a salon's team can contact you, and only if they can see your profile."
        footer={
          <p className="pb-4">
            Messages go to <strong>{me.email ?? "no email yet"}</strong>; salons who look see{" "}
            <strong>{me.phoneNumber ? localMobile(me.phoneNumber) : "no mobile yet"}</strong>.{" "}
            <Link to="/account/security" className="underline">
              Change them
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
      <Contacts items={items} />
    </div>
  );
}

function Contacts({ items }: { items: Schemas["ProfileContact"][] }) {
  const refresh = useRefresh();
  const [pending, setPending] = useState<string | null>(null);

  async function hide(salon: Schemas["ProfileContact"]["salon"]) {
    setPending(salon.id);
    try {
      unwrap(
        await api.PUT("/v1/me/hidden-salons/{salonId}", {
          params: { path: { salonId: salon.id } },
        }),
      );
      await refresh(`Hidden from ${salon.name}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <SectionCard
      title="Salons that contacted you"
      description="Every message, and each day a salon looked at your number."
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No salons have contacted you yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <AppLink href={item.salon.path} className="font-medium hover:underline">
                    {item.salon.name}
                  </AppLink>
                  <Badge variant="outline">
                    {item.kind === "message" ? "Sent a message" : "Looked at your number"}
                  </Badge>
                  <span className="text-muted-foreground">{ago(item.createdAt)}</span>
                </span>
                {item.hidden ? (
                  <span className="text-muted-foreground text-xs">Hidden from them</span>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={() => hide(item.salon)}
                  >
                    Hide from them
                  </Button>
                )}
              </div>
              {item.message && (
                <p className="whitespace-pre-line text-muted-foreground text-sm">{item.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
