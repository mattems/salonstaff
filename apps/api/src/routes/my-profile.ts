import { createRoute, z } from "@hono/zod-openapi";
import { seeker } from "@salonstaff/db";
import {
  ApiError,
  BRAND,
  CONTACT_LIMITS,
  decodeId,
  encodeId,
  endorsementRequestSchema,
  endorsePath,
  profileSettingsSchema,
  publicName,
  randomToken,
  salonPath,
  sha256Hex,
} from "@salonstaff/shared";
import { userActor } from "../lib/actor";
import { appUrl, sendEmail } from "../lib/notify";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  AuStateSchema,
  Deleted,
  EndorsementRelationshipSchema,
  errors,
  json,
  jsonBody,
  ProfileSettingsSchema,
  pathParam,
  Timestamp,
} from "../lib/schemas";
import { idFrom, requireSeeker } from "../lib/session";
import { contactRecordJson, myEndorsementJson, profileSettingsJson } from "../lib/views";

/**
 * A job seeker's control over their profile (D-13): who sees it, their share link, salons they
 * hide from, who has contacted them, and endorsements.
 */
export const myProfileRoutes = createRouter();

const TAGS = ["Me"];

const noProfile = () =>
  new ApiError("not_found", {
    detail: "You haven't made a profile yet",
    hint: "Send your basic details with PUT /v1/me/profile first.",
  });

// ---------- Visibility, contact and the share link ----------

myProfileRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/me/profile/settings",
    summary: "Choose who sees your profile and how salons contact you",
    description:
      "`visibility`: `public` (salons can find you and your share link works), `salons` (salons can find you) or `hidden` (only salons you apply to). `contactBy`: `email` (salons send a message we email to you; they never see your address), `phone` (they can see your mobile), or `both`. Salons you applied to always see your profile. Going public the first time makes your share link.",
    tags: TAGS,
    request: jsonBody(profileSettingsSchema),
    responses: {
      200: json(ProfileSettingsSchema, "Your settings"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: problemResponse("No profile yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    const me = seeker(await c.get("db")(), session.user.id);
    const profile = await me.profile();
    if (!profile) throw noProfile();
    if (input.contactBy && input.contactBy !== "phone" && !session.user.email) {
      throw new ApiError("validation_failed", {
        detail: "Add an email to your account first",
        hint: "Salons' messages are emailed to you. Add an email with POST /v1/me/email, or choose `phone`.",
        errors: [{ path: "contactBy", message: "Add an email to your account first" }],
      });
    }
    if (input.contactBy && input.contactBy !== "email" && !session.user.phoneNumber) {
      throw new ApiError("validation_failed", {
        detail: "Add a mobile to your account first",
        hint: "Salons see your verified mobile. Add one with POST /v1/me/mobile, or choose `email`.",
        errors: [{ path: "contactBy", message: "Add a mobile to your account first" }],
      });
    }
    if (c.get("dryRun")) {
      return c.json(
        profileSettingsJson({
          ...profile,
          visibility: input.visibility ?? profile.visibility,
          contactBy: input.contactBy ?? profile.contactBy,
        }),
        200,
      );
    }
    const saved = await me.saveSettings(input, userActor(c, session.user.id));
    return c.json(profileSettingsJson(saved), 200);
  },
);

myProfileRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/profile/share-code",
    summary: "Get a new share link",
    description:
      "Replaces your share code: the old link stops working at once. Use it if your link went somewhere you didn't want it to.",
    tags: TAGS,
    responses: {
      200: json(ProfileSettingsSchema, "Your settings, with the new code"),
      401: errors[401],
      403: errors[403],
      404: problemResponse("No profile yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const me = seeker(await c.get("db")(), session.user.id);
    const profile = await me.profile();
    if (!profile) throw noProfile();
    if (c.get("dryRun")) return c.json(profileSettingsJson(profile), 200);
    return c.json(profileSettingsJson(await me.renewShareCode(userActor(c, session.user.id))), 200);
  },
);

// ---------- Salons they hide from, and who contacted them ----------

const HiddenSalonSchema = z
  .object({
    id: z.string().openapi({ example: "sln_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    name: z.string(),
    path: z.string(),
    suburb: z.string(),
    state: AuStateSchema,
  })
  .openapi("HiddenSalon");

myProfileRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/hidden-salons",
    summary: "Salons you've hidden your profile from",
    description:
      "They can't see or contact you, wherever your profile is visible, unless you apply to one of their jobs.",
    tags: TAGS,
    responses: {
      200: json(
        z.object({ items: z.array(HiddenSalonSchema) }).openapi("HiddenSalons"),
        "The salons",
      ),
      401: errors[401],
      403: errors[403],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const salons = await seeker(await c.get("db")(), session.user.id).hiddenSalons();
    return c.json(
      {
        items: salons.map((salon) => ({
          id: encodeId("salon", salon.id),
          name: salon.name,
          path: salonPath(salon),
          suburb: salon.suburb,
          state: salon.state,
        })),
      },
      200,
    );
  },
);

const SalonParam = z.object({ salonId: pathParam("salonId", "sln_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const HiddenSchema = z.object({ hidden: z.boolean() }).openapi("HiddenFromSalon");

for (const hidden of [true, false]) {
  myProfileRoutes.openapi(
    createRoute({
      method: hidden ? "put" : "delete",
      path: "/v1/me/hidden-salons/{salonId}",
      summary: hidden ? "Hide your profile from a salon" : "Stop hiding your profile from a salon",
      description: hidden
        ? "Find the salon with GET /v1/salons?q=… Hiding from a salon twice is fine."
        : "Your profile shows to them again, as your visibility allows.",
      tags: TAGS,
      request: { params: SalonParam },
      responses: {
        200: json(HiddenSchema, hidden ? "Hidden" : "Shown again"),
        401: errors[401],
        403: errors[403],
        404: errors[404],
      },
    }),
    async (c) => {
      const session = await requireSeeker(c);
      const salonId = idFrom(
        "salon",
        c.req.valid("param").salonId,
        "salon",
        "Find the salon with GET /v1/salons?q=… and use its `id`.",
      );
      const me = seeker(await c.get("db")(), session.user.id);
      if (!(await me.profile())) throw noProfile();
      const found = c.get("dryRun")
        ? true
        : await me.hideFrom(salonId, hidden, userActor(c, session.user.id));
      if (!found) {
        throw new ApiError("not_found", {
          detail: "No salon with that ID",
          hint: "Find the salon with GET /v1/salons?q=… and use its `id`.",
        });
      }
      return c.json({ hidden }, 200);
    },
  );
}

const ProfileContactSchema = z
  .object({
    id: z.string().openapi({ example: "pct_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    kind: z.enum(["message", "phone"]).openapi({
      description:
        "`message`: they sent you a message (emailed to you). `phone`: they looked at your number.",
    }),
    message: z.string().nullable(),
    read: z.boolean().openapi({ description: "You've seen it in your inbox." }),
    sender: z.object({ name: z.string(), email: z.string() }).nullable().openapi({
      description: "Who sent a message, and where your reply goes (it's the message's reply-to).",
    }),
    createdAt: Timestamp,
    salon: z.object({ id: z.string(), name: z.string(), path: z.string() }),
    hidden: z.boolean().openapi({ description: "You've hidden your profile from this salon." }),
  })
  .openapi("ProfileContact");

myProfileRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/profile/contacts",
    summary: "Salons that contacted you",
    description:
      "Every message a salon sent you through us, and each day a salon looked at your number. Newest first, the last 200.",
    tags: TAGS,
    responses: {
      200: json(
        z.object({ items: z.array(ProfileContactSchema) }).openapi("ProfileContacts"),
        "Who contacted you",
      ),
      401: errors[401],
      403: errors[403],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const rows = await seeker(await c.get("db")(), session.user.id).contacts();
    return c.json({ items: rows.map(contactRecordJson) }, 200);
  },
);

myProfileRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/profile/contacts/read",
    summary: "Mark salons' messages as seen",
    description:
      "The ones in `ids`, or all of them when it's left out. Answers how many are still unseen.",
    tags: TAGS,
    request: jsonBody(
      z
        .object({
          ids: z
            .array(z.string().openapi({ example: "pct_01k6q2x8h4f7tbn3m9vz5cdr0e" }))
            .max(200)
            .optional(),
        })
        .openapi("ContactsRead"),
    ),
    responses: {
      200: json(z.object({ unread: z.number().int() }).openapi("Unread"), "Still unseen"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const { ids } = c.req.valid("json");
    const me = seeker(await c.get("db")(), session.user.id);
    // IDs that aren't valid can't be theirs: they're simply not marked.
    const decoded = ids?.map((id) => decodeId("profileContact", id)).filter((id) => id !== null);
    if (!c.get("dryRun")) await me.markContactsRead(decoded ?? null, userActor(c, session.user.id));
    return c.json({ unread: await me.unreadContacts() }, 200);
  },
);

// ---------- Endorsements ----------

const MyEndorsementSchema = z
  .object({
    id: z.string().openapi({ example: "end_01k6q2x8h4f7tbn3m9vz5cdr0e" }),
    status: z.enum(["requested", "received", "shown", "hidden"]).openapi({
      description:
        "`requested`: waiting for them to write it. `received`: written, waiting for you to show it. `shown` on your profile, or `hidden`.",
    }),
    refereeName: z.string(),
    refereeEmail: z.string(),
    note: z.string().nullable(),
    linkExpiresAt: Timestamp.nullable(),
    refereeTitle: z.string().nullable(),
    salonName: z.string().nullable(),
    relationship: EndorsementRelationshipSchema.nullable(),
    body: z.string().nullable(),
    contactOk: z.boolean().openapi({
      description: "They agreed that salons you apply to may contact them.",
    }),
    refereePhone: z.string().nullable(),
    onSalonStaff: z.boolean().openapi({
      description: "Their address is on a salon's team here: shown as such on your profile.",
    }),
    writtenAt: Timestamp.nullable(),
    createdAt: Timestamp,
  })
  .openapi("MyEndorsement");

myProfileRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/endorsements",
    summary: "Your endorsements and requests",
    tags: TAGS,
    responses: {
      200: json(
        z.object({ items: z.array(MyEndorsementSchema) }).openapi("MyEndorsements"),
        "Newest first",
      ),
      401: errors[401],
      403: errors[403],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const rows = await seeker(await c.get("db")(), session.user.id).endorsements();
    return c.json({ items: rows.map(myEndorsementJson) }, 200);
  },
);

myProfileRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/endorsements",
    summary: "Ask someone for an endorsement",
    description: `Emails them a link to write it (it works once, for ${CONTACT_LIMITS.endorsementLinkDays} days). You choose whether to show it once it's written, but you can't change it. Not your own address; each person once; ${CONTACT_LIMITS.endorsementRequestsPerDay} requests a day.`,
    tags: TAGS,
    request: jsonBody(endorsementRequestSchema),
    responses: {
      201: json(MyEndorsementSchema, "The request"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: problemResponse("No profile yet"),
      409: problemResponse("Already asked, or too many waiting"),
      429: problemResponse("Too many today"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    const me = seeker(await c.get("db")(), session.user.id);
    const profile = await me.profile();
    if (!profile) throw noProfile();
    const token = randomToken();
    if (c.get("dryRun")) {
      const now = new Date();
      return c.json(
        myEndorsementJson({
          id: "00000000-0000-0000-0000-000000000000",
          userId: session.user.id,
          status: "requested",
          refereeEmail: input.refereeEmail,
          refereeName: input.refereeName,
          note: input.note ?? null,
          tokenHash: null,
          tokenExpiresAt: now,
          refereeTitle: null,
          salonName: null,
          relationship: null,
          body: null,
          contactOk: false,
          refereePhone: null,
          refereeSalonId: null,
          writtenAt: null,
          createdAt: now,
        }),
        201,
      );
    }
    const { endorsement } = await me.requestEndorsement(
      input,
      await sha256Hex(token),
      userActor(c, session.user.id),
    );
    const name = `${profile.firstName} ${profile.lastName}`;
    sendEmail(c, endorsement.refereeEmail, {
      subject: `${name} asked you for an endorsement`,
      title: `Would you endorse ${name}?`,
      body: [
        `Hi ${input.refereeName}, ${name} is looking for work in hair and beauty on ${BRAND.name} and asked you to write a few words about working with them. It takes a couple of minutes, and you don't need an account.`,
        input.note ? `They said: "${input.note}"` : null,
        `The link works once, for ${CONTACT_LIMITS.endorsementLinkDays} days.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      action: "Write an endorsement",
      url: appUrl(c, endorsePath(token)),
      footer: `You received this because ${publicName(profile.firstName, profile.lastName)} entered your address on ${BRAND.name}. If you don't know them, ignore this email.`,
    });
    return c.json(myEndorsementJson(endorsement), 201);
  },
);

const EndorsementParam = z.object({ id: pathParam("id", "end_01k6q2x8h4f7tbn3m9vz5cdr0e") });
const endorsementHint =
  "List your endorsements with GET /v1/me/endorsements and use an `id` from there.";

myProfileRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/me/endorsements/{id}",
    summary: "Show or hide an endorsement",
    description: "Only a written one. Up to 5 shown at once.",
    tags: TAGS,
    request: {
      params: EndorsementParam,
      ...jsonBody(z.object({ shown: z.boolean() }).openapi("EndorsementShown")),
    },
    responses: {
      200: json(MyEndorsementSchema, "The endorsement"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: problemResponse("Not yours, or not written yet"),
      409: problemResponse("Five are shown already"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom("endorsement", c.req.valid("param").id, "endorsement", endorsementHint);
    const { shown } = c.req.valid("json");
    const me = seeker(await c.get("db")(), session.user.id);
    const notFound = () =>
      new ApiError("not_found", {
        detail: "You have no written endorsement with that ID",
        hint: endorsementHint,
      });
    if (c.get("dryRun")) {
      const row = (await me.endorsements()).find((e) => e.id === id);
      if (!row || row.status === "requested") throw notFound();
      return c.json(myEndorsementJson({ ...row, status: shown ? "shown" : "hidden" }), 200);
    }
    const row = await me.showEndorsement(id, shown, userActor(c, session.user.id));
    if (!row) throw notFound();
    return c.json(myEndorsementJson(row), 200);
  },
);

myProfileRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/endorsements/{id}",
    summary: "Delete an endorsement or request",
    description: "A request's link stops working. You can ask the same person again afterwards.",
    tags: TAGS,
    request: { params: EndorsementParam },
    responses: {
      200: json(Deleted, "Deleted"),
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom("endorsement", c.req.valid("param").id, "endorsement", endorsementHint);
    const me = seeker(await c.get("db")(), session.user.id);
    const found = c.get("dryRun")
      ? (await me.endorsements()).some((e) => e.id === id)
      : await me.removeEndorsement(id, userActor(c, session.user.id));
    if (!found) {
      throw new ApiError("not_found", {
        detail: "You have no endorsement with that ID",
        hint: endorsementHint,
      });
    }
    return c.json({ deleted: true as const }, 200);
  },
);
