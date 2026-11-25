import type { StaffConfirmedAction } from "@salonstaff/shared";
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { api, errorMessage, unwrap } from "./api";

export type Confirmation = { id: string; response: Record<string, unknown> } | { skip: true };

/**
 * Local development only: the API says a confirmation may be skipped, so the
 * person is asked which they want. `ConfirmChoiceDialog` shows the question.
 */
export interface PendingChoice {
  hasPasskey: boolean;
  choose: (choice: "passkey" | "skip" | "cancel") => void;
}
let pending: PendingChoice | null = null;
const listeners = new Set<() => void>();
const setPending = (next: PendingChoice | null) => {
  pending = next;
  for (const listener of listeners) listener();
};
export const pendingChoice = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => pending,
};

function askWhich(hasPasskey: boolean) {
  return new Promise<"passkey" | "skip">((resolve, reject) => {
    setPending({
      hasPasskey,
      choose(choice) {
        setPending(null);
        if (choice === "cancel") reject(new DOMException("Cancelled", "AbortError"));
        else resolve(choice);
      },
    });
  });
}

/**
 * Has the person approve one action on one target with their passkey, and
 * returns what to send as the request's `confirmation`. Deployed, this goes
 * straight to the browser's passkey prompt. In local development it first
 * offers to skip.
 */
export async function confirmWithPasskey(
  action: StaffConfirmedAction,
  target: string,
): Promise<Confirmation> {
  const challenge = unwrap(await api.POST("/admin/v1/confirmations", { body: { action, target } }));
  const { id, options } = challenge;
  if (challenge.can_skip && (await askWhich(Boolean(id && options))) === "skip") {
    return { skip: true };
  }
  if (!id || !options) throw new Error("The server sent no challenge");
  const response = await startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return { id, response: response as unknown as Record<string, unknown> };
}

/** Registers a passkey on this device or key. The first needs nothing more; later ones are confirmed with an existing one. */
export async function registerPasskey(name: string, hasOne: boolean) {
  const confirmation = hasOne ? await confirmWithPasskey("passkey.add", "new") : undefined;
  const started = unwrap(await api.POST("/admin/v1/passkeys/options", { body: { confirmation } }));
  const response = await startRegistration({
    optionsJSON: started.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return unwrap(
    await api.POST("/admin/v1/passkeys", {
      body: { id: started.id, name, response: response as unknown as Record<string, unknown> },
    }),
  );
}

/** `errorMessage`, plus the browser's own refusals: a closed prompt isn't a network fault. */
export function confirmErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") {
    return "The passkey prompt was closed or timed out. Try again.";
  }
  if (name === "InvalidStateError") return "That passkey is already registered.";
  if (name === "WebAuthnError" || name === "NotSupportedError" || name === "SecurityError") {
    return "This browser couldn't use a passkey here.";
  }
  return errorMessage(error);
}
