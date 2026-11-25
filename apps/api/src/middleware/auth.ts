import { getSession } from "@salonstaff/auth";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { authFor, emailSenderFromEnv } from "../lib/auth-config";
import { smsSenderFromEnv } from "../lib/sms";

export interface AuthOptions {
  /** Replaces the real email provider. Used by tests to read what would have been sent. */
  emailSender?: import("@salonstaff/email").EmailSender;
}

/** Makes the email and SMS senders, Better Auth and the current session available, lazily. */
export function authContext(options: AuthOptions = {}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let email = options.emailSender;
    c.set("email", () => {
      email ??= emailSenderFromEnv(c.env);
      return email;
    });
    c.set("sms", () => smsSenderFromEnv(c.env, c.get("email")));
    let auth: ReturnType<typeof authFor> | undefined;
    c.set("auth", () => {
      auth ??= authFor(c);
      return auth;
    });
    let session: ReturnType<typeof getSession> | undefined;
    c.set("session", () => {
      session ??= (async () => {
        const started = Date.now();
        const result = await getSession(await c.get("auth")(), c.req.raw.headers);
        c.get("timings").authMs = Date.now() - started;
        return result;
      })();
      return session;
    });
    await next();
  };
}
