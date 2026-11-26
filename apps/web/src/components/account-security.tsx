/**
 * How someone signs in, on both account pages: their email (changed with a code to the new
 * address), mobile, Google and Apple, and the devices they're signed in on.
 */
import {
  BRAND,
  emailChangeConfirmSchema,
  emailChangeSchema,
  mobileChangeConfirmSchema,
  mobileChangeSchema,
} from "@salonstaff/shared";
import { Badge } from "@salonstaff/ui/components/badge";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { Separator } from "@salonstaff/ui/components/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@salonstaff/ui/components/table";
import { useRouter } from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { FormMessage, parse, SubmitButton, TextField, useAction } from "@/components/form";
import { ApiProblem, api, authCall, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { ago, formatDate } from "@/lib/format";
import { forgetMe } from "@/lib/session";

type Methods = Schemas["SignInMethods"];
type Session = Schemas["SignInSession"];

/** For a page's loader: what these cards show. */
export async function loadAccountSecurity() {
  const [methods, sessions] = await Promise.all([
    api.GET("/v1/me/sign-in-methods"),
    api.GET("/v1/me/sessions"),
  ]);
  return { methods: unwrap(methods), sessions: unwrap(sessions).items };
}

export function AccountSecurity({ methods, sessions }: { methods: Methods; sessions: Session[] }) {
  return (
    <>
      <EmailCard email={methods.email} />
      <MobileCard phoneNumber={methods.phoneNumber} />
      <SignInMethods methods={methods} />
      <Sessions sessions={sessions} />
    </>
  );
}

function useRefresh() {
  const router = useRouter();
  return async () => {
    forgetMe();
    await router.invalidate();
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function EmailCard({ email }: { email: string | null }) {
  const refresh = useRefresh();
  const send = useAction();
  const confirm = useAction();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendCode(to: string) {
    unwrap(await api.POST("/v1/me/email", { body: { email: to } }));
    setSentTo(to);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          {email ? (
            <>
              Sign-in codes and notices go to <strong className="text-foreground">{email}</strong>.
            </>
          ) : (
            "Your account has no email yet. Add one to sign in with an email code and get notices by email."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo === null ? (
          <form
            className="space-y-4"
            onSubmit={send.submit(async (form) => {
              const body = parse(emailChangeSchema, { email: String(form.get("email") ?? "") });
              await sendCode(body.email);
            })}
          >
            <TextField
              label={email ? "New email" : "Email"}
              name="email"
              type="email"
              autoComplete="email"
              required
              error={send.errors.email}
              hint="We'll send a code to it to make sure it's yours."
            />
            <FormMessage message={send.message} />
            <SubmitButton pending={send.pending}>Send a code</SubmitButton>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={confirm.submit(async (form) => {
              const body = parse(emailChangeConfirmSchema, {
                email: sentTo,
                code: String(form.get("code") ?? ""),
              });
              unwrap(await api.POST("/v1/me/email/confirm", { body }));
              setSentTo(null);
              toast.success(email ? "Email changed" : "Email added");
              await refresh();
            })}
          >
            <p className="text-sm">
              We sent a 6-digit code to <strong>{sentTo}</strong>. It lasts 10 minutes. If it
              doesn't arrive, check the address: we can't send one to an address that's already on
              another account.
            </p>
            <TextField
              label="Code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              error={confirm.errors.code ?? confirm.errors.email}
            />
            <FormMessage message={confirm.errors.code ? null : confirm.message} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SubmitButton pending={confirm.pending}>
                {email ? "Change email" : "Add email"}
              </SubmitButton>
              <Button
                type="button"
                variant="link"
                className="px-0"
                disabled={send.pending}
                onClick={() => send.run(() => sendCode(sentTo))}
              >
                Send a new code
              </Button>
              <Button type="button" variant="link" className="px-0" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            </div>
            <FormMessage message={send.message} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mobile
// ---------------------------------------------------------------------------

/** 0412 345 678, from +61412345678. */
export const localMobile = (e164: string) =>
  e164.replace(/^\+61(4\d{2})(\d{3})(\d{3})$/, "0$1 $2 $3");

function MobileCard({ phoneNumber }: { phoneNumber: string | null }) {
  const refresh = useRefresh();
  const send = useAction();
  const confirm = useAction();
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function sendCode(to: string) {
    const { sentTo } = unwrap(await api.POST("/v1/me/mobile", { body: { phoneNumber: to } }));
    setSentTo(sentTo);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mobile</CardTitle>
        <CardDescription>
          {phoneNumber ? (
            <>
              Sign-in codes by SMS go to{" "}
              <strong className="text-foreground">{localMobile(phoneNumber)}</strong>. It's the
              number salons see if you let them call you.
            </>
          ) : (
            "No mobile yet. Add one to sign in with an SMS code and let salons call you."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo === null ? (
          <form
            className="space-y-4"
            onSubmit={send.submit(async (form) => {
              const body = parse(mobileChangeSchema, {
                phoneNumber: String(form.get("phoneNumber") ?? ""),
              });
              await sendCode(body.phoneNumber);
            })}
          >
            <TextField
              label={phoneNumber ? "New mobile" : "Mobile"}
              name="phoneNumber"
              type="tel"
              autoComplete="tel"
              placeholder="04xx xxx xxx"
              required
              error={send.errors.phoneNumber}
              hint="We'll text a code to it to make sure it's yours."
            />
            <FormMessage message={send.message} />
            <SubmitButton pending={send.pending}>Send a code</SubmitButton>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={confirm.submit(async (form) => {
              const body = parse(mobileChangeConfirmSchema, {
                phoneNumber: sentTo,
                code: String(form.get("code") ?? ""),
              });
              unwrap(await api.POST("/v1/me/mobile/confirm", { body }));
              setSentTo(null);
              toast.success(phoneNumber ? "Mobile changed" : "Mobile added");
              await refresh();
            })}
          >
            <p className="text-sm">
              We texted a 6-digit code to <strong>{localMobile(sentTo)}</strong>. It lasts 10
              minutes. If it doesn't arrive, check the number: we can't send one to a number that's
              already on another account.
            </p>
            <TextField
              label="Code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              error={confirm.errors.code ?? confirm.errors.phoneNumber}
            />
            <FormMessage message={confirm.errors.code ? null : confirm.message} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SubmitButton pending={confirm.pending}>
                {phoneNumber ? "Change mobile" : "Add mobile"}
              </SubmitButton>
              <Button
                type="button"
                variant="link"
                className="px-0"
                disabled={send.pending}
                onClick={() => send.run(() => sendCode(sentTo))}
              >
                Send a new code
              </Button>
              <Button type="button" variant="link" className="px-0" onClick={() => setSentTo(null)}>
                Use a different number
              </Button>
            </div>
            <FormMessage message={send.message} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Google and Apple
// ---------------------------------------------------------------------------

/** Better Auth's codes when Google or Apple sends someone back without connecting. */
function linkProblem(code: string): string {
  if (code.includes("already_linked")) {
    return `That account is already connected to a different ${BRAND.name} account. Sign in with it there and disconnect it first.`;
  }
  return "That account couldn't be connected. Try again.";
}

function SignInMethods({ methods }: { methods: Methods }) {
  const refresh = useRefresh();
  const [pending, setPending] = useState<string | null>(null);

  // Google or Apple sent them back with an error: say why, once, and tidy the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("error");
    if (!error) return;
    toast.error(linkProblem(error));
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  async function connect(provider: string) {
    setPending(provider);
    try {
      const here = window.location.href;
      const { url } = await authCall<{ url?: string }>("link-social", {
        provider,
        callbackURL: here,
        errorCallbackURL: here,
      });
      if (!url) throw new Error("No address to connect at");
      window.location.assign(url);
    } catch (error) {
      setPending(null);
      toast.error(
        error instanceof ApiProblem && error.status === 404
          ? "That isn't set up yet."
          : errorMessage(error),
      );
    }
  }

  async function disconnect(provider: Methods["providers"][number]["provider"], label: string) {
    setPending(provider);
    try {
      unwrap(
        await api.DELETE("/v1/me/sign-in-methods/{provider}", {
          params: { path: { provider } },
        }),
      );
      toast.success(`${label} disconnected`);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Other ways you sign in</CardTitle>
        <CardDescription>
          Connect Google or Apple to sign in with one click. Its email doesn't have to match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {methods.providers.map((item, i) => (
          <Fragment key={item.provider}>
            {i > 0 && <Separator />}
            <MethodRow
              title={item.label}
              detail={
                item.connected
                  ? `Connected ${formatDate(item.connectedAt)}`
                  : item.available
                    ? "Not connected"
                    : "Not available yet"
              }
            >
              {item.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => disconnect(item.provider, item.label)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!item.available || pending !== null}
                  onClick={() => connect(item.provider)}
                >
                  Connect
                </Button>
              )}
            </MethodRow>
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}

function MethodRow({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-sm">{detail}</p>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function Sessions({ sessions }: { sessions: Session[] }) {
  const refresh = useRefresh();
  const [pending, setPending] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<string>) {
    setPending(key);
    try {
      toast.success(await action());
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }
  const signOut = (session: Session) =>
    run(session.id, async () => {
      unwrap(await api.DELETE("/v1/me/sessions/{id}", { params: { path: { id: session.id } } }));
      return `Signed out ${session.device}`;
    });
  const signOutOthers = () =>
    run("others", async () => {
      const { signedOut } = unwrap(await api.DELETE("/v1/me/sessions"));
      return signedOut === 1
        ? "Signed out 1 other device"
        : `Signed out ${signedOut} other devices`;
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Where you're signed in</CardTitle>
          <CardDescription>
            If you don't recognise a device, sign it out. It'll need a new code to get back in.
          </CardDescription>
        </div>
        {sessions.length > 1 && (
          <Button variant="outline" size="sm" disabled={pending !== null} onClick={signOutOthers}>
            Sign out everywhere else
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  <span className="mr-2">{session.device}</span>
                  {session.current && <Badge variant="secondary">This device</Badge>}
                </TableCell>
                <TableCell className="font-mono text-xs">{session.ipAddress || "–"}</TableCell>
                <TableCell>{session.current ? "Now" : ago(session.lastActiveAt)}</TableCell>
                <TableCell className="text-right">
                  {!session.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => signOut(session)}
                    >
                      Sign out
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
