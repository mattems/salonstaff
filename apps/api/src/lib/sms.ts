import { type EmailSender, smsAsEmail } from "@salonstaff/email";
import type { Env } from "../env";
import { ConfigurationError } from "./auth-config";
import { mayReach } from "./verify";

export interface SmsSender {
  send(message: { to: string; body: string }): Promise<void>;
  /**
   * Phones `to` and reads out `say` (twice), for a number that can't take a text (a claim code to
   * a salon's landline, D-22).
   */
  call(message: { to: string; say: string }): Promise<void>;
}

/** What a call says: the message, a pause, then the same again, in an Australian voice. */
export function callTwiml(say: string): string {
  const text = say.replace(/[<>&"']/g, "");
  const line = `<Say language="en-AU">${text}</Say>`;
  return `<Response><Pause length="1"/>${line}<Pause length="2"/><Say language="en-AU">Again.</Say>${line}</Response>`;
}

/** Twilio when configured; locally, Mailpit (as an email to sms+<number>@local.test). */
export function smsSenderFromEnv(env: Env, email: () => EmailSender): SmsSender {
  const local = env.ENVIRONMENT === "local";
  const twilio =
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
      ? {
          sid: env.TWILIO_ACCOUNT_SID,
          auth: btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        }
      : null;
  // Calls need a real number: TWILIO_VOICE_FROM, or TWILIO_FROM when it is one (not a sender ID).
  const voiceFrom =
    env.TWILIO_VOICE_FROM || (env.TWILIO_FROM?.startsWith("+") ? env.TWILIO_FROM : "");

  async function twilioPost(path: string, fields: Record<string, string>, what: string) {
    if (!twilio) throw new Error("Twilio isn't configured");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${twilio.auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(fields),
    });
    if (!res.ok) throw new Error(`Twilio refused the ${what} (${res.status}): ${await res.text()}`);
  }

  return {
    async send({ to, body }) {
      if (twilio && env.TWILIO_FROM && mayReach(env, to)) {
        await twilioPost("Messages.json", { To: to, From: env.TWILIO_FROM, Body: body }, "SMS");
      } else if (local) {
        await email().send(smsAsEmail({ phoneNumber: to, body }));
      } else {
        throw new ConfigurationError(
          "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.",
        );
      }
    },
    async call({ to, say }) {
      if (twilio && voiceFrom && mayReach(env, to)) {
        await twilioPost("Calls.json", { To: to, From: voiceFrom, Twiml: callTwiml(say) }, "call");
      } else if (local) {
        // Locally the call is an email to Mailpit, like a text.
        await email().send({
          to: `call+${to.replace(/[^\d]/g, "")}@local.test`,
          subject: `Call to ${to}`,
          html: `<pre>${say.replace(/</g, "&lt;")}</pre>`,
          text: say,
        });
      } else {
        throw new ConfigurationError(
          "Calls are not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VOICE_FROM (a voice-capable number).",
        );
      }
    },
  };
}
