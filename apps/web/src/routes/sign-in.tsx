/**
 * Sign in, or sign up on first use (D-02): Google, Apple, a code by email or by SMS, and
 * locally a dev login for the demo accounts. `?as=employer` is the salon side; `?next=` where
 * to go afterwards.
 */
import { BRAND, normaliseAuMobile } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { Separator } from "@salonstaff/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@salonstaff/ui/components/tabs";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
  FormError,
  FormMessage,
  parse,
  SubmitButton,
  TextField,
  useAction,
} from "@/components/form";
import { Notice, Page } from "@/components/page";
import { ApiProblem, authCall, errorMessage } from "@/lib/api";
import { isLocalApi } from "@/lib/environment";
import { privatePage } from "@/lib/seo";
import { currentUser, forgetMe, landingAfterSignIn, safeNext } from "@/lib/session";

interface SignInSearch {
  next?: string | undefined;
  as?: "employer" | undefined;
  error?: string | undefined;
}

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    next: safeNext(search.next),
    as: search.as === "employer" ? "employer" : undefined,
    error: typeof search.error === "string" ? search.error.slice(0, 100) : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.me)
      throw redirect({ href: landingAfterSignIn(context.me, search.next, search.as) });
  },
  loader: async () => ({ local: await isLocalApi() }),
  head: () => privatePage("Sign in"),
  component: SignIn,
});

/** Better Auth's error codes after a Google or Apple sign-in, in words. */
function providerError(code: string): string {
  if (code === "ACCOUNT_SUSPENDED" || code.toLowerCase().includes("suspend")) {
    return `This account has been suspended. Contact ${BRAND.supportEmail} if you think this is a mistake.`;
  }
  return "That sign-in didn't work. Try again, or use an email or mobile code.";
}

function useFinishSignIn() {
  const navigate = useNavigate();
  const router = useRouter();
  const { next, as } = Route.useSearch();
  return async () => {
    forgetMe();
    const me = await currentUser();
    if (!me) throw new FormError("Signed in, but the session didn't stick. Try again.");
    await navigate({ href: landingAfterSignIn(me, next, as) });
    await router.invalidate();
  };
}

function SignIn() {
  const { as, error } = Route.useSearch();
  const { local } = Route.useLoaderData();
  const employer = as === "employer";
  return (
    <Page width="narrow">
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {employer ? "Sign in to post jobs" : `Sign in to ${BRAND.name}`}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            New here? Signing in creates your account. There are no passwords.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && <Notice tone="destructive">{providerError(error)}</Notice>}
          <SocialButtons />
          <div className="flex items-center gap-3 text-muted-foreground text-xs">
            <Separator className="flex-1" />
            or get a code
            <Separator className="flex-1" />
          </div>
          <Tabs defaultValue="email">
            <TabsList className="w-full">
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="mobile">Mobile</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="pt-4">
              <CodeSignIn channel="email" />
            </TabsContent>
            <TabsContent value="mobile" className="pt-4">
              <CodeSignIn channel="mobile" />
            </TabsContent>
          </Tabs>
          {local && <DevLogin />}
        </CardContent>
      </Card>
    </Page>
  );
}

function SocialButtons() {
  const { next, as } = Route.useSearch();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function start(provider: "google" | "apple", label: string) {
    setPending(provider);
    setMessage(null);
    const back = new URL("/sign-in", window.location.origin);
    if (next) back.searchParams.set("next", next);
    if (as) back.searchParams.set("as", as);
    try {
      const result = await authCall<{ url?: string }>("sign-in/social", {
        provider,
        callbackURL: back.toString(),
        errorCallbackURL: back.toString(),
      });
      if (!result.url) throw new Error("No address to sign in at");
      window.location.href = result.url;
    } catch (error) {
      setPending(null);
      setMessage(
        error instanceof ApiProblem && (error.status === 404 || error.code === "PROVIDER_NOT_FOUND")
          ? `${label} sign-in isn't set up yet. Use an email or mobile code.`
          : errorMessage(error),
      );
    }
  }
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        disabled={pending !== null}
        onClick={() => start("google", "Google")}
      >
        Continue with Google
      </Button>
      <Button variant="outline" disabled={pending !== null} onClick={() => start("apple", "Apple")}>
        Continue with Apple
      </Button>
      <FormMessage message={message} />
    </div>
  );
}

const emailSchema = z.object({ email: z.email("Enter a valid email").trim().toLowerCase() });
const mobileSchema = z.object({
  phone: z
    .string()
    .transform((value) => normaliseAuMobile(value) ?? "")
    .pipe(z.string().min(1, "Enter an Australian mobile number (04xx xxx xxx)")),
});
const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/** Two steps: send a code to an email or mobile, then enter it. */
function CodeSignIn({ channel }: { channel: "email" | "mobile" }) {
  const { as } = Route.useSearch();
  const finish = useFinishSignIn();
  const send = useAction();
  const verify = useAction();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const role = as === "employer" ? { role: "employer" } : {};

  async function sendCode(to: string) {
    if (channel === "email") {
      await authCall("email-otp/send-verification-otp", { email: to, type: "sign-in" });
    } else {
      await authCall("phone-number/send-otp", { phoneNumber: to });
    }
    setSentTo(to);
  }

  if (!sentTo) {
    return (
      <form
        className="space-y-3"
        onSubmit={send.submit(async (form) => {
          const value = String(form.get("to") ?? "");
          const to =
            channel === "email"
              ? parse(emailSchema, { email: value }).email
              : parse(mobileSchema, { phone: value }).phone;
          await sendCode(to);
        })}
      >
        {channel === "email" ? (
          <TextField
            label="Email"
            name="to"
            type="email"
            autoComplete="email"
            required
            error={send.errors.email}
          />
        ) : (
          <TextField
            label="Australian mobile"
            name="to"
            type="tel"
            autoComplete="tel"
            placeholder="04xx xxx xxx"
            required
            error={send.errors.phone}
          />
        )}
        <FormMessage message={send.message} />
        <SubmitButton pending={send.pending} className="w-full">
          Send me a code
        </SubmitButton>
      </form>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={verify.submit(async (form) => {
        const { code } = parse(codeSchema, { code: String(form.get("code") ?? "") });
        if (channel === "email") {
          await authCall("sign-in/email-otp", { email: sentTo, otp: code, ...role });
        } else {
          await authCall("phone-number/verify", { phoneNumber: sentTo, code, ...role });
        }
        await finish();
      })}
    >
      <p className="text-sm">
        We sent a 6-digit code to <strong>{sentTo}</strong>. It lasts 10 minutes.
      </p>
      <TextField
        label="Code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        autoFocus
        error={verify.errors.code}
      />
      <FormMessage message={verify.message} />
      <SubmitButton pending={verify.pending} className="w-full">
        Sign in
      </SubmitButton>
      <div className="flex justify-between text-sm">
        <Button type="button" variant="link" className="px-0" onClick={() => setSentTo(null)}>
          {channel === "email" ? "Use a different email" : "Use a different number"}
        </Button>
        <Button
          type="button"
          variant="link"
          className="px-0"
          disabled={send.pending}
          onClick={() => send.run(() => sendCode(sentTo))}
        >
          Send a new code
        </Button>
      </div>
    </form>
  );
}

/** Local only: the seeded demo accounts, without a code. */
function DevLogin() {
  const finish = useFinishSignIn();
  const action = useAction();
  const login = (role: "seeker" | "employer") =>
    action.run(async () => {
      await authCall("dev-login", { role });
      await finish();
    });
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="font-medium text-sm">Dev login (local only)</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={action.pending}
          onClick={() => login("seeker")}
        >
          Demo job seeker
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={action.pending}
          onClick={() => login("employer")}
        >
          Demo salon owner
        </Button>
      </div>
      <FormMessage message={action.message} />
    </div>
  );
}
