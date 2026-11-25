import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLink } from "@/components/app-link";
import { FormMessage, useAction } from "@/components/form";
import { Notice, Page } from "@/components/page";
import { api, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";
import { forgetMe, signInPath } from "@/lib/session";

interface InviteSearch {
  token?: string | undefined;
}

/** The link in a team invite email (D-11): see what it's for, sign in, accept. */
export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>): InviteSearch => ({
    token: typeof search.token === "string" ? search.token.slice(0, 200) : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    if (!deps.token) return null;
    const result = await api.GET("/v1/invites/{token}", {
      params: { path: { token: deps.token } },
    });
    return result.response.ok ? unwrap(result) : null;
  },
  head: () => privatePage("Join a salon"),
  component: AcceptInvite,
});

const ROLE = { owner: "an owner", manager: "a manager" } as const;

function AcceptInvite() {
  const invite = Route.useLoaderData();
  const { token } = Route.useSearch();
  const { me } = Route.useRouteContext();
  const navigate = useNavigate();
  const action = useAction();
  const here = `/invite?token=${encodeURIComponent(token ?? "")}`;
  return (
    <Page width="narrow">
      <Card>
        <CardHeader>
          <CardTitle>{invite ? `Join ${invite.salon.name}` : "Join a salon"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!invite ? (
            <Notice tone="destructive" title="This invite is invalid or has expired">
              Ask the salon's owner to invite you again.
            </Notice>
          ) : (
            <>
              <p className="text-sm">
                {invite.invitedBy ?? "The salon's owner"} invited {invite.email} to help run{" "}
                {invite.salon.name} ({invite.salon.suburb} {invite.salon.state}) as{" "}
                {ROLE[invite.role]}.
              </p>
              {!me ? (
                <Button asChild>
                  <AppLink href={signInPath(here, "employer")}>Sign in to accept</AppLink>
                </Button>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    You're signed in as {me.email ?? me.phoneNumber}.
                    {me.role === "seeker" &&
                      " Accepting makes this an employer account, which can't apply for jobs."}
                  </p>
                  <FormMessage message={action.message} />
                  <Button
                    disabled={action.pending}
                    onClick={() =>
                      action.run(async () => {
                        const salon = unwrap(
                          await api.POST("/v1/invites/{token}/accept", {
                            params: { path: { token: token ?? "" } },
                          }),
                        );
                        forgetMe();
                        await navigate({ to: "/employer/$salonId", params: { salonId: salon.id } });
                      })
                    }
                  >
                    Accept and join
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
