/**
 * A passkey made of software, so tests can register one and answer challenges
 * with real signatures. It does what a browser and an authenticator do between
 * them; `flaws` makes it do one thing wrong.
 */
const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const fromB64url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (ch) => ch.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const sha256 = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
const uint32 = (value: number) => new Uint8Array([value >>> 24, value >>> 16, value >>> 8, value]);
const cborText = (text: string) =>
  concat(new Uint8Array([0x60 + text.length]), encoder.encode(text));
const cborBytes = (bytes: Uint8Array) =>
  concat(
    bytes.length < 24
      ? new Uint8Array([0x40 + bytes.length])
      : bytes.length < 256
        ? new Uint8Array([0x58, bytes.length])
        : new Uint8Array([0x59, bytes.length >> 8, bytes.length & 0xff]),
    bytes,
  );

/** WebCrypto signs as r||s; WebAuthn wants the two integers in DER. */
function der(raw: Uint8Array) {
  const int = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const body = (trimmed[0] as number) & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
    return concat(new Uint8Array([0x02, body.length]), body);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export interface Flaws {
  /** The page the browser says it was on. */
  origin?: string;
  /** Touched, but no fingerprint or PIN. */
  unverified?: boolean;
  /** Report this use count instead of the next one. */
  counter?: number;
}

type Options = { challenge: string; rpId?: string; rp?: { id?: string } };

export async function softwarePasskey(origin: string) {
  const keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey;
  const id = crypto.getRandomValues(new Uint8Array(16));
  const cose = concat(
    new Uint8Array([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]),
    cborBytes(fromB64url(jwk.x as string)),
    new Uint8Array([0x22]),
    cborBytes(fromB64url(jwk.y as string)),
  );
  let uses = 0;

  const clientData = (type: string, options: Options, flaws: Flaws) =>
    encoder.encode(
      JSON.stringify({ type, challenge: options.challenge, origin: flaws.origin ?? origin }),
    );
  const authData = async (rpId: string, flags: number, counter: number, attested?: Uint8Array) =>
    concat(
      await sha256(encoder.encode(rpId)),
      new Uint8Array([flags]),
      uint32(counter),
      attested ?? new Uint8Array(),
    );
  const hostname = new URL(origin).hostname;

  return {
    id: b64url(id),

    /** The answer to `POST /admin/v1/passkeys/options`. */
    async register(options: Options, flaws: Flaws = {}) {
      const data = await authData(
        options.rp?.id ?? hostname,
        flaws.unverified ? 0x41 : 0x45,
        0,
        concat(new Uint8Array(16), new Uint8Array([0, id.length]), id, cose),
      );
      const attestation = concat(
        new Uint8Array([0xa3]),
        cborText("fmt"),
        cborText("none"),
        cborText("attStmt"),
        new Uint8Array([0xa0]),
        cborText("authData"),
        cborBytes(data),
      );
      return {
        id: b64url(id),
        rawId: b64url(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientData("webauthn.create", options, flaws)),
          attestationObject: b64url(attestation),
          transports: ["internal"],
        },
      };
    },

    /** The answer to `POST /admin/v1/confirmations`. */
    async answer(options: Options, flaws: Flaws = {}) {
      uses = flaws.counter ?? uses + 1;
      const data = await authData(options.rpId ?? hostname, flaws.unverified ? 0x01 : 0x05, uses);
      const client = clientData("webauthn.get", options, flaws);
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keys.privateKey,
        concat(data, await sha256(client)),
      );
      return {
        id: b64url(id),
        rawId: b64url(id),
        type: "public-key",
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(client),
          authenticatorData: b64url(data),
          signature: b64url(der(new Uint8Array(signature))),
        },
      };
    },
  };
}
