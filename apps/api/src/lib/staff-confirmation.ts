/**
 * Confirming a dangerous staff action with a passkey (D-06). The API hands out a
 * challenge for one action on one target; the browser has the passkey sign
 * it; the route that makes the change checks the answer here.
 */
import { z } from "@hono/zod-openapi";
import { type Actor, PasskeyExistsError, type StaffPasskey } from "@salonstaff/db";
import { ApiError, BRAND, decodeId, encodeId, type StaffConfirmedAction } from "@salonstaff/shared";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { ConfigurationError } from "./auth-config";
import { isLocal, type StaffContext } from "./staff-context";

/**
 * What the browser sends with the change: the challenge's ID and the passkey's
 * signed answer. In local development it can say `skip` instead.
 */
export const Confirmation = z
  .object({
    id: z.string().optional(),
    response: z.record(z.string(), z.unknown()).optional(),
    skip: z.boolean().optional(),
  })
  .optional()
  .openapi({
    description:
      "`id` and `response`: from `POST /admin/v1/confirmations` for this action and target, answered by your passkey. Not needed for a dry run. `skip: true` is accepted only in local development.",
  });
type Given = z.infer<typeof Confirmation>;

/**
 * Skipping is a developer's choice, request by request, and exists only in local development
 * with no Cloudflare Access in front: wherever Access is set, a passkey is needed.
 */
export const canSkipConfirmation = (c: Context<AppEnv>) => isLocal(c);

/** Passkeys belong to the admin portal's hostname, the only place a browser talks to us from. */
function relyingParty(c: Context<AppEnv>) {
  if (!c.env.ADMIN_ORIGIN) {
    throw new ConfigurationError(
      "ADMIN_ORIGIN is not set, so passkeys can't be checked. See docs/runbooks/staff-passkeys.md.",
    );
  }
  return { origin: c.env.ADMIN_ORIGIN, id: new URL(c.env.ADMIN_ORIGIN).hostname };
}

const refused = (detail: string, hint: string) =>
  new ApiError("confirmation_required", { detail, hint });
const AGAIN = "Start again from the admin portal: it asks for your passkey just before the change.";

export async function startConfirmation(
  c: Context<AppEnv>,
  { staff, data }: StaffContext,
  action: StaffConfirmedAction,
  target: string,
) {
  const can_skip = canSkipConfirmation(c);
  const passkeys = await data.passkeys.list(staff.id);
  if (passkeys.length === 0) {
    // Locally, someone with no passkey can still skip.
    if (can_skip) return { id: null, options: null, can_skip };
    throw refused(
      "You have no passkey to confirm this with",
      "Register one on the admin portal's Passkeys screen, then try again.",
    );
  }
  const options = await generateAuthenticationOptions({
    rpID: relyingParty(c).id,
    allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
    userVerification: "required",
  });
  const id = await data.confirmations.start(staff.id, options.challenge, {
    kind: "confirm",
    action,
    target,
  });
  return { id: encodeId("confirmation", id), options, can_skip };
}

/**
 * Call straight after `requireStaff` (and finding what is being changed) in a
 * route that needs a passkey. Returns the actor to make the change as: the
 * staff member, with the passkey that confirmed it for the audit entry. A dry
 * run needs no passkey.
 */
export async function requireConfirmation(
  c: Context<AppEnv>,
  ctx: StaffContext,
  action: StaffConfirmedAction,
  target: string,
  given: Given,
): Promise<Actor> {
  const { staff, data, actor } = ctx;
  if (c.get("dryRun")) return actor;
  if (given?.skip) {
    if (canSkipConfirmation(c)) return actor;
    throw refused("Confirmation can't be skipped here", AGAIN);
  }
  if (!given?.id || !given.response)
    throw refused("This needs confirming with your passkey", AGAIN);
  const party = relyingParty(c);

  const id = decodeId("confirmation", given.id);
  // Used up before it is checked: a wrong answer can't be tried twice.
  const challenge = id
    ? await data.confirmations.use(staff.id, id, { kind: "confirm", action, target })
    : null;
  if (!challenge) {
    throw refused(
      "That confirmation has expired, was already used, or was for something else",
      AGAIN,
    );
  }
  const response = given.response as unknown as AuthenticationResponseJSON;
  const passkey = (await data.passkeys.list(staff.id)).find((p) => p.credentialId === response.id);
  if (!passkey) throw refused("That passkey is not one of yours", AGAIN);

  let counter: number;
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: party.origin,
      expectedRPID: party.id,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
    if (!verified) throw new Error("Not verified");
    counter = authenticationInfo.newCounter;
  } catch {
    throw refused("Your passkey's answer could not be verified", AGAIN);
  }
  if (!(await data.passkeys.used(passkey, counter))) {
    throw refused(
      "That passkey's use count went backwards, which means it may have been copied",
      "Remove it on the Passkeys screen and register a new one.",
    );
  }
  return { ...actor, confirmedWith: passkey.id };
}

export async function startRegistration(c: Context<AppEnv>, { staff, data }: StaffContext) {
  const existing = await data.passkeys.list(staff.id);
  const options = await generateRegistrationOptions({
    rpName: `${BRAND.name} admin`,
    rpID: relyingParty(c).id,
    userID: new TextEncoder().encode(staff.id) as Uint8Array<ArrayBuffer>,
    userName: staff.email,
    userDisplayName: staff.name,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: "discouraged", userVerification: "required" },
  });
  const id = await data.confirmations.start(staff.id, options.challenge, { kind: "register" });
  return { id: encodeId("confirmation", id), options };
}

export async function finishRegistration(
  c: Context<AppEnv>,
  { staff, data, actor }: StaffContext,
  input: { id: string; name: string; response: Record<string, unknown> },
): Promise<StaffPasskey> {
  const party = relyingParty(c);
  const hint = "Start again from the Passkeys screen.";
  const id = decodeId("confirmation", input.id);
  const challenge = id ? await data.confirmations.use(staff.id, id, { kind: "register" }) : null;
  if (!challenge) {
    throw new ApiError("conflict", { detail: "That registration has expired or was used", hint });
  }
  const response = input.response as unknown as RegistrationResponseJSON;
  let credential: { id: string; publicKey: Uint8Array; counter: number };
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: party.origin,
      expectedRPID: party.id,
      requireUserVerification: true,
    });
    if (!verified) throw new Error("Not verified");
    credential = registrationInfo.credential;
  } catch {
    throw new ApiError("validation_failed", {
      detail: "That passkey could not be verified",
      hint: `${hint} The passkey must ask for your fingerprint, face or PIN.`,
    });
  }
  try {
    return await data.passkeys.add(
      staff,
      {
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey as Uint8Array<ArrayBuffer>),
        counter: credential.counter,
        transports: response.response.transports ?? [],
        name: input.name,
      },
      actor,
    );
  } catch (error) {
    if (!(error instanceof PasskeyExistsError)) throw error;
    throw new ApiError("conflict", { detail: "That passkey is already registered", hint });
  }
}
