import { Badge } from "@salonstaff/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AccountSecurity, loadAccountSecurity } from "@/components/account-security";
import { DeleteAccountButton } from "@/components/delete-account";
import { FormMessage, formText, SubmitButton, TextField, useAction } from "@/components/form";
import { PageHeader } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe } from "@/lib/session";

/**
 * An employer's own account: their name, email and other ways they sign in, where they're signed
 * in, their salons, deleting it.
 */
export const Route = createFileRoute("/employer/account")({
  beforeLoad: ({ context }) => {
    // A job seeker's account is their profile.
    if (context.me.role !== "employer") throw redirect({ to: "/account" });
  },
  loader: () => loadAccountSecurity(),
  head: () => privatePage("Your account"),
  component: Account,
});

const ROLE = { owner: "Owner", manager: "Manager" } as const;

function Account() {
  const { me } = Route.useRouteContext();
  const security = Route.useLoaderData();
  const router = useRouter();
  const action = useAction();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Your account" />
      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
          <CardDescription>
            What your salons' teams see, and the name on invites you send.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={action.submit(async (form) => {
              const { name = "" } = formText(form);
              unwrap(await api.PATCH("/v1/me", { body: { name } }));
              forgetMe();
              toast.success("Saved");
              await router.invalidate();
            })}
          >
            <TextField
              label="Name"
              name="name"
              defaultValue={me.name}
              maxLength={100}
              required
              error={action.errors.name}
            />
            <FormMessage message={action.message} />
            <SubmitButton pending={action.pending}>Save</SubmitButton>
          </form>
        </CardContent>
      </Card>
      <AccountSecurity {...security} />
      <Card>
        <CardHeader>
          <CardTitle>Your salons</CardTitle>
        </CardHeader>
        <CardContent>
          {me.salons.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              None yet.{" "}
              <Link to="/employer/onboarding" className="underline">
                Add a salon
              </Link>
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {me.salons.map((salon) => (
                <li key={salon.id} className="flex items-center gap-2">
                  <Link
                    to="/employer/$salonId"
                    params={{ salonId: salon.id }}
                    className="font-medium hover:underline"
                  >
                    {salon.name}
                  </Link>
                  <Badge variant="outline">{ROLE[salon.role]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Delete your account</CardTitle>
          <CardDescription>
            You leave every salon's team and are signed out everywhere. A salon where you're the
            only owner goes too: one you made is deleted with its jobs, and a listing you claimed
            goes back to the directory. To keep a salon, make someone else an owner on its Team page
            first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountButton warning="Your account goes, and so does every salon where you're the only owner, with its jobs and applicants. This can't be undone." />
        </CardContent>
      </Card>
    </div>
  );
}
