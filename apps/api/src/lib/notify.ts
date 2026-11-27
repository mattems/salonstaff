import { type Contact, pushDevicesOf } from "@salonstaff/db";
import { noticeEmail } from "@salonstaff/email";
import { BRAND, encodeId } from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { pushSenderFromEnv } from "./push";
import { realEmail } from "./views";

export interface Notice {
  subject: string;
  title: string;
  body: string;
  action: string;
  url: string;
  footer?: string;
  /** Where replies go: an account's own address, never one typed into a form. */
  replyTo?: string;
}

/**
 * Tells someone by email, or by SMS when their account has only a mobile number, and by a push to
 * their phones with the app (D-15). Runs after the response; a failure is logged and never fails
 * the request.
 */
export function notify(c: Context<AppEnv>, contact: Contact | null, notice: Notice): void {
  if (!contact) return;
  push(c, contact.userId, { title: notice.title, body: notice.body, url: notice.url });
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
  c.get("background")(task);
}

/**
 * A push to each of someone's phones with the app (D-15), when the API can send pushes. A phone
 * Apple says is gone is forgotten.
 */
export function push(
  c: Context<AppEnv>,
  userId: string,
  message: { title: string; body: string; url: string },
): void {
  const sender = pushSenderFromEnv(c.env, c.get("email"));
  if (!sender) return;
  const body =
    message.body.length > 180 ? `${message.body.slice(0, 179).trimEnd()}…` : message.body;
  const task = (async () => {
    const devices = pushDevicesOf(await c.get("db")());
    for (const device of await devices.forUser(userId)) {
      const delivered = await sender
        .send(device, { userId, title: message.title, body, url: message.url })
        .catch((error: unknown) => {
          logFailure(c, error);
          return true;
        });
      if (!delivered) await devices.forget(device.token);
    }
  })().catch((error: unknown) => logFailure(c, error));
  c.get("background")(task);
}

/** An email to an address that isn't an account's (a listing's business email). */
export function sendEmail(c: Context<AppEnv>, to: string, notice: Notice): void {
  const task = (async () => {
    await c
      .get("email")()
      .send(await noticeEmail({ to, ...notice }));
  })().catch((error: unknown) => logFailure(c, error));
  c.get("background")(task);
}

/** A text to a number that may no longer be an account's (the old mobile, after a change). */
export function sendSms(c: Context<AppEnv>, to: string, body: string): void {
  const task = (async () => {
    await c
      .get("sms")()
      .send({ to, body: body.slice(0, 320) });
  })().catch((error: unknown) => logFailure(c, error));
  c.get("background")(task);
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

/** Tells a claimed salon's other owners that someone else became an owner too (D-11). */
export function tellOwnersAboutClaim(
  c: Context<AppEnv>,
  owners: Contact[],
  salon: { id: string; name: string },
  claimant: string,
) {
  for (const owner of owners) {
    notify(c, owner, {
      subject: `${claimant} is now an owner of ${salon.name}`,
      title: `${salon.name} has a new owner`,
      body: `${claimant} claimed ${salon.name} on ${BRAND.name} and proved they run the business, so they're now one of its owners. If that's wrong, take them off the team and contact support@salonstaff.com.au.`,
      action: "See the team",
      url: appUrl(c, `/employer/${encodeId("salon", salon.id)}/team`),
    });
  }
}
