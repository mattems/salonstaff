import { Card, CardContent } from "@salonstaff/ui/components/card";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AbnBadge,
  readSalonForm,
  requireOwnSalon,
  SalonFields,
  SalonStatusBanner,
} from "@/components/employer";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe } from "@/lib/session";

export const Route = createFileRoute("/employer/settings")({
  beforeLoad: ({ context }) => {
    requireOwnSalon(context.me);
  },
  loader: async () => unwrap(await api.GET("/v1/salon")),
  head: () => privatePage("Salon details"),
  component: Settings,
});

function Settings() {
  const salon = Route.useLoaderData();
  const action = useAction();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Salon details"
        description="A new name or suburb gives your salon and its jobs new addresses; the old ones redirect."
      />
      <SalonStatusBanner salon={salon} />
      <AbnBadge salon={salon} />
      <Card>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={action.submit(async (form) => {
              const salonForm = readSalonForm(form);
              // A blank optional field clears it (left out would keep the old value).
              const body = {
                ...salonForm,
                website: salonForm.website ?? null,
                instagram: salonForm.instagram ?? null,
                about: salonForm.about ?? null,
              };
              unwrap(await api.PATCH("/v1/salon", { body }));
              forgetMe();
              toast.success("Saved");
              await router.invalidate();
            })}
          >
            <SalonFields salon={salon} errors={action.errors} />
            <FormMessage message={action.message} />
            <SubmitButton pending={action.pending}>Save</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
