import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AbnBadge, readSalonForm, SalonFields, SalonStatusBanner } from "@/components/employer";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { SalonPictures } from "@/components/salon-pictures";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe } from "@/lib/session";

export const Route = createFileRoute("/employer/$salonId/settings")({
  beforeLoad: ({ context, params }) => {
    if (context.salon.role !== "owner") {
      throw redirect({ to: "/employer/$salonId", params: { salonId: params.salonId } });
    }
  },
  loader: ({ context }) => context.salon,
  head: () => privatePage("Salon details"),
  component: Settings,
});

function Settings() {
  const salon = Route.useLoaderData();
  const salonId = salon.id;
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
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>The cover photo and logo on your salon's page.</CardDescription>
        </CardHeader>
        <CardContent>
          <SalonPictures
            key={salon.id}
            salon={salon}
            onChange={() => {
              forgetMe();
              void router.invalidate();
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
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
              unwrap(
                await api.PATCH("/v1/employer/salons/{salonId}", {
                  params: { path: { salonId } },
                  body,
                }),
              );
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
