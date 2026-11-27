import type { PushDevice } from "@salonstaff/db";
import { type EmailSender, pushAsEmail } from "@salonstaff/email";
import { importPKCS8, SignJWT } from "jose";
import type { Env } from "../env";

export interface PushMessage {
  /** Whose phone, for the local stand-in. */
  userId: string;
  title: string;
  body: string;
  /** A website link: the app opens its own screen for it (D-15). */
  url: string;
}

export interface PushSender {
  /** False when Apple says the token no longer works: forget the device. */
  send(device: PushDevice, message: PushMessage): Promise<boolean>;
}

/** Apple lets a provider token live an hour and wants it reused, not remade per push. */
let providerToken: { value: string; keyId: string; madeAt: number } | undefined;

async function apnsToken(
  env: Required<Pick<Env, "APNS_KEY_ID" | "APNS_PRIVATE_KEY" | "APPLE_TEAM_ID">>,
) {
  const fresh =
    providerToken?.keyId === env.APNS_KEY_ID && Date.now() - providerToken.madeAt < 40 * 60_000;
  if (!fresh) {
    const key = await importPKCS8(env.APNS_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256");
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: env.APNS_KEY_ID })
      .setIssuer(env.APPLE_TEAM_ID)
      .setIssuedAt()
      .sign(key);
    providerToken = { value, keyId: env.APNS_KEY_ID, madeAt: Date.now() };
  }
  return (providerToken as { value: string }).value;
}

/** Reasons Apple gives for a token that will never work again. */
const GONE = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

/**
 * Apple's push service (APNs) when the API has an APNs key; locally without one, Mailpit (as an
 * email to push+<userId>@local.test). Null when pushes can't be sent: notices still go by email.
 */
export function pushSenderFromEnv(env: Env, email: () => EmailSender): PushSender | null {
  const { APNS_KEY_ID, APNS_PRIVATE_KEY, APPLE_TEAM_ID, APPLE_BUNDLE_ID } = env;
  if (APNS_KEY_ID && APNS_PRIVATE_KEY && APPLE_TEAM_ID && APPLE_BUNDLE_ID) {
    return {
      async send(device, message) {
        const host = device.sandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
        const res = await fetch(`https://${host}/3/device/${device.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${await apnsToken({ APNS_KEY_ID, APNS_PRIVATE_KEY, APPLE_TEAM_ID })}`,
            "apns-topic": APPLE_BUNDLE_ID,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            aps: { alert: { title: message.title, body: message.body }, sound: "default" },
            // expo-notifications reads a push's data from `body`.
            body: { url: message.url },
          }),
        });
        if (res.ok) return true;
        const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? "";
        if (res.status === 410 || GONE.has(reason)) return false;
        throw new Error(`APNs refused the push (${res.status} ${reason})`);
      },
    };
  }
  if (env.ENVIRONMENT === "local") {
    return {
      async send(_device, message) {
        await email().send(pushAsEmail(message));
        return true;
      },
    };
  }
  return null;
}
