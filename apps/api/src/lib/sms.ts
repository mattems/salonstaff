import { type EmailSender, smsAsEmail } from "@salonstaff/email";
import type { Env } from "../env";
import { ConfigurationError } from "./auth-config";

export interface SmsSender {
  send(message: { to: string; body: string }): Promise<void>;
}

/** Twilio when configured; locally, Mailpit (as an email to sms+<number>@local.test). */
export function smsSenderFromEnv(env: Env, email: () => EmailSender): SmsSender {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) {
    const sid = env.TWILIO_ACCOUNT_SID;
    const auth = btoa(`${sid}:${env.TWILIO_AUTH_TOKEN}`);
    const from = env.TWILIO_FROM;
    return {
      async send({ to, body }) {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: to, From: from, Body: body }),
        });
        if (!res.ok) throw new Error(`Twilio refused the SMS (${res.status}): ${await res.text()}`);
      },
    };
  }
  if (env.ENVIRONMENT === "local") {
    return { send: ({ to, body }) => email().send(smsAsEmail({ phoneNumber: to, body })) };
  }
  return {
    send: async () => {
      throw new ConfigurationError(
        "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.",
      );
    },
  };
}
