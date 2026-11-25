import type { Contact } from "@salonstaff/db";
import { noticeEmail } from "@salonstaff/email";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { realEmail } from "./views";

export interface Notice {
  subject: string;
  title: string;
  body: string;
  action: string;
  url: string;
  footer?: string;
}

/**
 * Tells someone by email, or by SMS when their account has only a mobile number. Runs after the
 * response; a failure is logged and never fails the request.
 */
export function notify(c: Context<AppEnv>, contact: Contact | null, notice: Notice): void {
  if (!contact) return;
  const email = realEmail(contact.email);
  const phone = contact.phoneNumber;
  if (!email && !phone) return;
  const task = (async () => {
    if (email) {
      await c
        .get("email")()
        .send(await noticeEmail({ to: email, ...notice }));
    } else if (phone) {
      await c
        .get("sms")()
        .send({ to: phone, body: `${notice.title} ${notice.url}`.slice(0, 320) });
    }
  })().catch((error: unknown) => logFailure(c, error));
  c.executionCtx.waitUntil(task);
}

/** An email to an address that isn't an account's (a listing's business email). */
export function sendEmail(c: Context<AppEnv>, to: string, notice: Notice): void {
  const task = (async () => {
    await c
      .get("email")()
      .send(await noticeEmail({ to, ...notice }));
  })().catch((error: unknown) => logFailure(c, error));
  c.executionCtx.waitUntil(task);
}

function logFailure(c: Context<AppEnv>, error: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "notification_failed",
      request_id: c.get("requestId"),
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}

/** A link into the website. */
export const appUrl = (c: Context<AppEnv>, path: string) => `${c.env.APP_ORIGIN}${path}`;
