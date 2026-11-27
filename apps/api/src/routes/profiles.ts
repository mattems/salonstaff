import { createRoute, z } from "@hono/zod-openapi";
import { publicProfiles, salonScope, salonsFor } from "@salonstaff/db";
import {
  ApiError,
  BRAND,
  encodeId,
  endorsementSchema,
  publicName,
  SHARE_CODE_RE,
  sha256Hex,
} from "@salonstaff/shared";
import { visitorActor } from "../lib/actor";
import { appUrl, notify } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { errors, json, jsonBody, pathParam, SharedProfileSchema } from "../lib/schemas";
import { mediaUrl } from "../lib/storage";
import { contactOptionsJson, sharedProfileJson } from "../lib/views";

/**
 * Job seeker profiles reached by link (D-13): a share page, and a referee writing an endorsement.
 * Neither needs an account.
 */
export const profileRoutes = createRouter();

const TAGS = ["Profiles"];

const gone = () =>
  new ApiError("not_found", {
    detail: "This profile link doesn't work",
    hint: "The person may have turned their share link off or replaced it. Ask them for a new one.",
  });

profileRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/profiles/{code}",
    summary: "A job seeker's shared profile",
    description:
      "Through the share link they posted: their first name and last initial, work, skills, portfolio, endorsements and which checks they passed. Never their contact details, work rights or pay. Works only while their profile is public. Signed in on a salon's team, `viewer` says how you can contact them.",
    tags: TAGS,
    request: { params: z.object({ code: pathParam("code", "k7x2m9qd4h") }) },
    responses: { 200: json(SharedProfileSchema, "The profile"), 404: errors[404] },
  }),
  async (c) => {
    const { code } = c.req.valid("param");
    if (!SHARE_CODE_RE.test(code)) throw gone();
    const db = await c.get("db")();
    const shared = await publicProfiles(db).byShareCode(code);
    if (!shared) throw gone();
    const session = await c.get("session")();
    let viewer = null;
    if (session && session.user.id !== shared.userId) {
      const mine = (await salonsFor(db).ofUser(session.user.id)).filter(
        ({ salon }) => salon.status === "active",
      );
      const salons = [];
      for (const { salon } of mine) {
        const found = await salonScope(db, salon.id).access(shared.userId);
        if (found?.access.view) {
          salons.push({
            id: encodeId("salon", salon.id),
            name: salon.name,
            candidateId: encodeId("user", shared.userId),
            contact: contactOptionsJson(found.access),
          });
        }
      }
      if (mine.length > 0) viewer = { salons };
    }
    c.header("Cache-Control", "private, no-store");
    return c.json({ ...sharedProfileJson(c.env, shared), viewer }, 200);
  },
);

// ---------- Endorsements, written by the referee ----------

const TokenParam = z.object({ token: pathParam("token", "3q2-…") });

const EndorsementAskSchema = z
  .object({
    name: z.string().openapi({ example: "Jess D.", description: "Who asked." }),
    photoUrl: z.string().nullable(),
    headline: z.string().nullable(),
    refereeName: z.string().openapi({ description: "Your name, as they typed it." }),
    note: z.string().nullable().openapi({ description: "What they said when asking." }),
  })
  .openapi("EndorsementAsk");

const linkGone = () =>
  new ApiError("not_found", {
    detail: "This endorsement link has expired or was already used",
    hint: "Ask the person to send you a new one.",
  });

profileRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/endorsements/{token}",
    summary: "An endorsement you were asked for",
    description: "From the link in your email: who asked you. The link works once, for 30 days.",
    tags: TAGS,
    request: { params: TokenParam },
    responses: { 200: json(EndorsementAskSchema, "Who asked"), 404: errors[404] },
  }),
  async (c) => {
    const asked = await publicProfiles(await c.get("db")()).asked(
      await sha256Hex(c.req.valid("param").token),
    );
    if (!asked) throw linkGone();
    const { profile, endorsement } = asked;
    c.header("Cache-Control", "private, no-store");
    return c.json(
      {
        name: publicName(profile.firstName, profile.lastName),
        photoUrl: mediaUrl(c.env, profile.photoKey),
        headline: profile.headline,
        refereeName: endorsement.refereeName,
        note: endorsement.note,
      },
      200,
    );
  },
);

profileRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/endorsements/{token}",
    summary: "Write the endorsement",
    description:
      "Once only. They choose whether to show it on their profile; they can't change what you wrote. Your email address and phone are never shown on their profile; salons they apply to see them only if `contactOk`.",
    tags: TAGS,
    request: { params: TokenParam, ...jsonBody(endorsementSchema) },
    responses: {
      201: json(z.object({ written: z.literal(true) }).openapi("EndorsementWritten"), "Thank you"),
      400: errors[400],
      404: problemResponse("The link has expired or was used"),
    },
  }),
  async (c) => {
    const tokenHash = await sha256Hex(c.req.valid("param").token);
    const input = c.req.valid("json");
    const profiles = publicProfiles(await c.get("db")());
    if (c.get("dryRun")) {
      if (!(await profiles.asked(tokenHash))) throw linkGone();
      return c.json({ written: true as const }, 201);
    }
    const { profile } = await profiles.write(tokenHash, input, visitorActor(c));
    const contact = await profiles.contactOf(profile.userId);
    notify(c, contact, {
      topic: "account",
      subject: `${input.name} wrote you an endorsement`,
      title: `${input.name} endorsed you`,
      body: `Read it and choose whether to show it on your ${BRAND.name} profile.`,
      action: "Read it",
      url: appUrl(c, "/account/endorsements"),
    });
    return c.json({ written: true as const }, 201);
  },
);
