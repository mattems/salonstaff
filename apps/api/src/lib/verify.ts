/**
 * Twilio Verify (D-23): Twilio makes the six-digit code, sends it by SMS or reads it out in a
 * phone call, and checks what the person typed. Used for sign-in and mobile-change codes and for
 * claims by a listing's mobile or landline. Without it (no `TWILIO_VERIFY_SERVICE_SID`) we make
 * our own codes and send them through `SmsSender` (Mailpit locally).
 *
 * Locally, real texts and calls go only to the numbers in `TWILIO_LOCAL_ALLOW`: the imported
 * directory holds real salons' numbers, and they must never be texted or rung from a laptop.
 */
import { ApiError } from "@salonstaff/shared";
import type { Env } from "../env";

export type VerifyChannel = "sms" | "call";

export interface PhoneVerify {
  /** Sends a new code to `to` (E.164). Throws an `ApiError` the person can act on. */
  start(to: string, channel: VerifyChannel): Promise<void>;
  /**
   * Whether `code` is the one sent to `to`. Throws `link_expired` when there's nothing to check
   * (it expired, was used, or took too many tries).
   */
  check(to: string, code: string): Promise<boolean>;
}

/** How long a Verify code lasts (Twilio's default for a service). */
export const VERIFY_CODE_MINUTES = 10;

/** The E.164 numbers in a comma-separated list (spaces and other punctuation ignored). */
const numbersIn = (list: string | undefined) =>
  new Set(
    (list ?? "")
      .split(",")
      .map((n) => n.replace(/[^\d+]/g, ""))
      .filter(Boolean),
  );

/**
 * Whether a real text or call may go to `to`. Deployed, any number; locally, only the ones in
 * `TWILIO_LOCAL_ALLOW` (yours), so nothing reaches a real salon by accident.
 */
export function mayReach(env: Env, to: string): boolean {
  if (env.ENVIRONMENT !== "local") return true;
  return numbersIn(env.TWILIO_LOCAL_ALLOW).has(to.replace(/[^\d+]/g, ""));
}

/** Twilio Verify, when it's set up; else null. */
export function phoneVerifyFromEnv(env: Env): PhoneVerify | null {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const service = env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !service) return null;
  const auth = `Basic ${btoa(`${sid}:${token}`)}`;
  const post = (path: string, fields: Record<string, string>) =>
    fetch(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });

  return {
    async start(to, channel) {
      const res = await post("Verifications", { To: to, Channel: channel });
      if (res.ok) return;
      throw verifyProblem(res.status, await res.json().catch(() => ({})), channel);
    },
    async check(to, code) {
      const res = await post("VerificationCheck", { To: to, Code: code });
      // Nothing to check: it expired, was used, or had too many wrong tries.
      if (res.status === 404) {
        throw new ApiError("link_expired", {
          detail: "That code has expired",
          hint: "Ask for a new code.",
        });
      }
      if (!res.ok) {
        throw verifyProblem(res.status, await res.json().catch(() => ({})), "sms");
      }
      const body = (await res.json()) as { status?: string };
      return body.status === "approved";
    },
  };
}

/** Twilio's error, as something the person can act on. Logged in full. */
function verifyProblem(status: number, body: unknown, channel: VerifyChannel): ApiError {
  const { code, message } = (body ?? {}) as { code?: number; message?: string };
  console.error(
    JSON.stringify({ level: "error", event: "twilio_verify_failed", status, code, message }),
  );
  // https://www.twilio.com/docs/api/errors
  if (code === 60203 || code === 60212 || status === 429) {
    return new ApiError("rate_limited", {
      detail: "Too many codes have been sent to that number",
      hint: "Wait a while (up to 10 minutes), then try again.",
    });
  }
  if (code === 60205 || code === 21614) {
    return new ApiError("validation_failed", {
      detail: "That number can't receive a text",
      hint: "Use a mobile number, or a call for a landline.",
    });
  }
  if (code === 60200 || code === 60410 || code === 60605 || code === 21211) {
    return new ApiError("validation_failed", {
      detail: channel === "call" ? "We couldn't call that number" : "We couldn't text that number",
      hint: "Check the number, or choose another way.",
    });
  }
  return new ApiError("upstream_unavailable", {
    detail: "Twilio didn't send the code",
    hint: "Try again in a minute.",
  });
}

/** Locally, while Verify is set up: refuses a number that isn't yours (`TWILIO_LOCAL_ALLOW`). */
export function localNumberRefused(to: string): ApiError {
  return new ApiError("validation_failed", {
    detail: `Locally, codes only go to the numbers in TWILIO_LOCAL_ALLOW, not ${to}`,
    hint: "Add your own number to TWILIO_LOCAL_ALLOW in apps/api/.dev.vars, or remove TWILIO_VERIFY_SERVICE_SID to use Mailpit.",
    errors: [{ path: "phoneNumber", message: "Not in TWILIO_LOCAL_ALLOW" }],
  });
}
