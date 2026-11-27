import { createRoute, z } from "@hono/zod-openapi";
import {
  type Account,
  type Db,
  profileValues,
  type SeekerProfile,
  salonsFor,
  seeker,
  summarise,
} from "@salonstaff/db";
import {
  ApiError,
  educationSchema,
  encodeId,
  experienceSchema,
  profileDetailsSchema,
  salonPath,
  seekerProfileSchema,
} from "@salonstaff/shared";
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { userActor } from "../lib/actor";
import { problemResponse } from "../lib/openapi";
import { createRouter } from "../lib/router";
import {
  Deleted,
  errors,
  FileField,
  formBody,
  JobSummarySchema,
  json,
  jsonBody,
  MeSchema,
  MyApplicationSchema,
  MyProfileSchema,
  PortfolioItemSchema,
  pathParam,
} from "../lib/schemas";
import { idFrom, requireSeeker, requireUser } from "../lib/session";
import {
  deleteUploads,
  inspectUpload,
  mediaUrl,
  requireUploadAllowance,
  storeUpload,
} from "../lib/storage";
import { cancelSubscription } from "../lib/stripe";
import {
  jobSummaryJson,
  myApplicationJson,
  myProfileJson,
  portfolioJson,
  profileJson,
  realEmail,
  verificationJson,
} from "../lib/views";

/** The signed-in person: their account and job seeker profile (photo, portfolio, experience, education, skills). */
export const meRoutes = createRouter();

const TAGS = ["Me"];

/** The `Me` answer for an account. */
export function meJson(c: Context<AppEnv>, account: Account) {
  const { user, profile, checks, salons, unreadMessages } = account;
  return {
    id: encodeId("user", user.id),
    name: user.name,
    email: realEmail(user.email),
    phoneNumber: user.phoneNumber,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    profile: profile ? profileJson(c.env, profile) : null,
    verification: verificationJson(checks),
    salons: salons.map(({ salon, role }) => ({
      id: encodeId("salon", salon.id),
      name: salon.name,
      path: salonPath(salon),
      status: salon.status,
      role,
    })),
    unreadMessages,
  };
}

async function fullProfile(c: Context<AppEnv>, db: Db, userId: string) {
  const full = await seeker(db, userId).fullProfile();
  if (!full) {
    throw new ApiError("not_found", {
      detail: "You haven't made a profile yet",
      hint: "Send your basic details with PUT /v1/me/profile first.",
    });
  }
  return myProfileJson(c.env, full);
}

const emptyChecks = () => summarise([]);

const notYours = (what: string) =>
  new ApiError("not_found", {
    detail: `You have no ${what} with that ID`,
    hint: "Get your profile with GET /v1/me/profile and use an `id` from there.",
  });

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me",
    summary: "Who you are",
    description:
      "Your account, your job seeker profile (if you've made one), your verification summary with the verification IDs of passed checks, and the salons you manage.",
    tags: TAGS,
    responses: { 200: json(MeSchema, "Your account"), 401: errors[401] },
  }),
  async (c) => {
    const session = await requireUser(c);
    const account = await seeker(await c.get("db")(), session.user.id).account();
    if (!account) throw new ApiError("unauthenticated", { hint: "Sign in again." });
    return c.json(meJson(c, account), 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/v1/me",
    summary: "Change your name",
    description:
      "The name a salon's team and the people you invite see. A job seeker's name follows their profile: change it with PUT /v1/me/profile instead.",
    tags: TAGS,
    request: jsonBody(
      z
        .object({ name: z.string().trim().min(1).max(100).openapi({ example: "Olive Owner" }) })
        .openapi("AccountChanges"),
    ),
    responses: {
      200: json(MeSchema, "Your account"),
      400: errors[400],
      401: errors[401],
      409: problemResponse("Your name comes from your job seeker profile"),
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const me = seeker(await c.get("db")(), session.user.id);
    const { name } = c.req.valid("json");
    if (!c.get("dryRun")) await me.rename(name, userActor(c, session.user.id));
    const account = await me.account();
    if (!account) throw new ApiError("unauthenticated", { hint: "Sign in again." });
    if (c.get("dryRun")) account.user = { ...account.user, name };
    return c.json(meJson(c, account), 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/profile",
    summary: "Your full profile",
    description:
      "Everything salons see: basics, skills and availability, experience, education, portfolio, shown endorsements and verification. `settings` says who sees it and how salons may contact you; only you get those.",
    tags: TAGS,
    responses: {
      200: json(MyProfileSchema, "Your profile"),
      401: errors[401],
      403: errors[403],
      404: problemResponse("No profile yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    return c.json(await fullProfile(c, await c.get("db")(), session.user.id), 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "put",
    path: "/v1/me/profile",
    summary: "Save your basic details",
    description:
      "Creates your job seeker profile, or replaces its basics. Your account's name becomes `firstName lastName`. Instagram and TikTok take a handle (`@jess`) or a link to the profile. Salons see your account's verified mobile (change it with POST /v1/me/mobile), not a number here. Changing your first or last name after your ID is verified expires that check (`identity` becomes `expired` in GET /v1/me/checks): verify your ID again (D-16).",
    tags: TAGS,
    request: jsonBody(seekerProfileSchema),
    responses: {
      200: json(MyProfileSchema, "Your profile"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      const [current, account] = await Promise.all([scope.fullProfile(), scope.account()]);
      const now = new Date();
      const profile: SeekerProfile = {
        userId: session.user.id,
        photoKey: null,
        specialties: [],
        brands: [],
        availableDays: [],
        employmentTypes: [],
        availableFrom: null,
        travelKm: null,
        phone: null,
        qualifications: null,
        payExpectation: null,
        payMin: null,
        payPeriod: "hour",
        visibility: "salons",
        contactBy: "both",
        shareCode: null,
        createdAt: now,
        ...current?.profile,
        ...profileValues(input),
        updatedAt: now,
      };
      return c.json(
        myProfileJson(c.env, {
          experience: [],
          education: [],
          portfolio: [],
          endorsements: [],
          ...current,
          profile,
          checks: account?.checks ?? current?.checks ?? emptyChecks(),
        }),
        200,
      );
    }
    await scope.saveProfile(input, userActor(c, session.user.id));
    return c.json(await fullProfile(c, db, session.user.id), 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "put",
    path: "/v1/me/profile/details",
    summary: "Save your skills and availability",
    description:
      "Specialties and brands (tags; duplicates are dropped, ignoring case), the days and kinds of work you're after, when you can start, how far you'll travel and the least you'd take (`payMin` per `payPeriod`; leave it out to not say). Needs a profile first.",
    tags: TAGS,
    request: jsonBody(profileDetailsSchema),
    responses: {
      200: json(MyProfileSchema, "Your profile"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("No profile yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      await scope.requireProfile();
      return c.json(await fullProfile(c, db, session.user.id), 200);
    }
    await scope.saveDetails(input, userActor(c, session.user.id));
    return c.json(await fullProfile(c, db, session.user.id), 200);
  },
);

// ---------- Photo and portfolio ----------

const PhotoSchema = z.object({ photoUrl: z.string().nullable() }).openapi("ProfilePhoto");

meRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/photo",
    summary: "Set your profile photo",
    description:
      "A JPG, PNG, WebP or HEIC image of 8MB or less, as the `file` field of a multipart form. Replaces (and deletes) any earlier photo.",
    tags: TAGS,
    request: formBody(z.object({ file: FileField })),
    responses: {
      200: json(PhotoSchema, "The new photo"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("No profile yet"),
      413: problemResponse("Too large"),
      415: problemResponse("Not an image"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const { file } = c.req.valid("form");
    const scope = seeker(await c.get("db")(), session.user.id);
    await scope.requireProfile();
    // Before the dry run too: it reads the whole file like the real thing.
    await requireUploadAllowance(c.env, session.user.id);
    if (c.get("dryRun")) {
      await inspectUpload(file, ["image"]);
      return c.json({ photoUrl: null }, 200);
    }
    const { key } = await storeUpload(c.env, file, { bucket: "public", allow: ["image"] });
    try {
      const { previousKey } = await scope.setPhoto(key, userActor(c, session.user.id));
      await deleteUploads(c.env, "public", [previousKey]);
    } catch (error) {
      await deleteUploads(c.env, "public", [key]);
      throw error;
    }
    return c.json({ photoUrl: mediaUrl(c.env, key) }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/photo/image",
    summary: "Your profile photo's file",
    description:
      "The picture itself, from this address rather than the media CDN, so the website can draw it into a post image to share (D-13).",
    tags: TAGS,
    responses: {
      200: {
        description: "The picture",
        content: { "image/*": { schema: z.string().openapi({ format: "binary" }) } },
      },
      401: errors[401],
      403: errors[403],
      404: problemResponse("No photo"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const profile = await seeker(await c.get("db")(), session.user.id).profile();
    const object = profile?.photoKey ? await c.env.MEDIA.get(profile.photoKey) : null;
    if (!object) {
      throw new ApiError("not_found", {
        detail: "You have no profile photo",
        hint: "Add one with POST /v1/me/photo.",
      });
    }
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    }) as never;
  },
);

meRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/photo",
    summary: "Remove your profile photo",
    tags: TAGS,
    responses: {
      200: json(PhotoSchema, "No photo"),
      401: errors[401],
      403: errors[403],
      409: problemResponse("No profile yet"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const scope = seeker(await c.get("db")(), session.user.id);
    if (c.get("dryRun")) {
      await scope.requireProfile();
      return c.json({ photoUrl: null }, 200);
    }
    const { previousKey } = await scope.setPhoto(null, userActor(c, session.user.id));
    await deleteUploads(c.env, "public", [previousKey]);
    return c.json({ photoUrl: null }, 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/portfolio",
    summary: "Add a portfolio photo",
    description:
      "An image of your work (`file`, multipart) with an optional `caption`. Up to 24 photos.",
    tags: TAGS,
    request: formBody(
      z.object({
        file: FileField,
        caption: z.string().trim().max(140).optional(),
      }),
    ),
    responses: {
      201: json(PortfolioItemSchema, "The new portfolio photo"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("No profile yet, or the portfolio is full"),
      413: problemResponse("Too large"),
      415: problemResponse("Not an image"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const { file, caption } = c.req.valid("form");
    const scope = seeker(await c.get("db")(), session.user.id);
    await scope.requireProfile();
    // Before the dry run too: it reads the whole file like the real thing.
    await requireUploadAllowance(c.env, session.user.id);
    if (c.get("dryRun")) {
      await inspectUpload(file, ["image"]);
      return c.json(
        {
          id: encodeId("portfolioItem", "00000000-0000-0000-0000-000000000000"),
          imageUrl: "",
          caption: caption || null,
        },
        201,
      );
    }
    const { key } = await storeUpload(c.env, file, { bucket: "public", allow: ["image"] });
    try {
      const item = await scope.addPortfolioItem(
        { imageKey: key, caption },
        userActor(c, session.user.id),
      );
      return c.json(portfolioJson(c.env, item), 201);
    } catch (error) {
      await deleteUploads(c.env, "public", [key]);
      throw error;
    }
  },
);

const ItemParams = z.object({ id: pathParam("id", "pfi_01k6q2x8h4f7tbn3m9vz5cdr0e") });

meRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/portfolio/{id}",
    summary: "Remove a portfolio photo",
    tags: TAGS,
    request: { params: ItemParams },
    responses: {
      200: json(MyProfileSchema, "Your profile"),
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom(
      "portfolioItem",
      c.req.valid("param").id,
      "portfolio photo",
      "Get your profile with GET /v1/me/profile and use an `id` from there.",
    );
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      const full = await scope.fullProfile();
      if (!full?.portfolio.some((p) => p.id === id)) throw notYours("portfolio photo");
      return c.json(myProfileJson(c.env, full), 200);
    }
    const key = await scope.removePortfolioItem(id, userActor(c, session.user.id));
    if (!key) throw notYours("portfolio photo");
    await deleteUploads(c.env, "public", [key]);
    return c.json(await fullProfile(c, db, session.user.id), 200);
  },
);

// ---------- Experience and education ----------

meRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/experience",
    summary: "Add a role to your experience",
    description: "Months are `YYYY-MM`; leave `endMonth` out for your current role. Up to 15.",
    tags: TAGS,
    request: jsonBody(experienceSchema),
    responses: {
      201: json(MyProfileSchema, "Your profile"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("No profile yet, or the list is full"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      await scope.requireProfile();
      return c.json(await fullProfile(c, db, session.user.id), 201);
    }
    await scope.addExperience(input, userActor(c, session.user.id));
    return c.json(await fullProfile(c, db, session.user.id), 201);
  },
);

meRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/experience/{id}",
    summary: "Remove a role from your experience",
    tags: TAGS,
    request: { params: z.object({ id: pathParam("id", "exp_01k6q2x8h4f7tbn3m9vz5cdr0e") }) },
    responses: {
      200: json(MyProfileSchema, "Your profile"),
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom(
      "experience",
      c.req.valid("param").id,
      "role",
      "Get your profile with GET /v1/me/profile and use an `id` from there.",
    );
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      const full = await scope.fullProfile();
      if (!full?.experience.some((e) => e.id === id)) throw notYours("role");
      return c.json(myProfileJson(c.env, full), 200);
    }
    if (!(await scope.removeExperience(id, userActor(c, session.user.id)))) throw notYours("role");
    return c.json(await fullProfile(c, db, session.user.id), 200);
  },
);

meRoutes.openapi(
  createRoute({
    method: "post",
    path: "/v1/me/education",
    summary: "Add a qualification or course",
    description:
      "What you studied and where. Up to 10. To have a certificate verified, use POST /v1/me/checks/qualification.",
    tags: TAGS,
    request: jsonBody(educationSchema),
    responses: {
      201: json(MyProfileSchema, "Your profile"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      409: problemResponse("No profile yet, or the list is full"),
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const input = c.req.valid("json");
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      await scope.requireProfile();
      return c.json(await fullProfile(c, db, session.user.id), 201);
    }
    await scope.addEducation(input, userActor(c, session.user.id));
    return c.json(await fullProfile(c, db, session.user.id), 201);
  },
);

meRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me/education/{id}",
    summary: "Remove a qualification or course",
    tags: TAGS,
    request: { params: z.object({ id: pathParam("id", "edu_01k6q2x8h4f7tbn3m9vz5cdr0e") }) },
    responses: {
      200: json(MyProfileSchema, "Your profile"),
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  }),
  async (c) => {
    const session = await requireSeeker(c);
    const id = idFrom(
      "education",
      c.req.valid("param").id,
      "qualification",
      "Get your profile with GET /v1/me/profile and use an `id` from there.",
    );
    const db = await c.get("db")();
    const scope = seeker(db, session.user.id);
    if (c.get("dryRun")) {
      const full = await scope.fullProfile();
      if (!full?.education.some((e) => e.id === id)) throw notYours("qualification");
      return c.json(myProfileJson(c.env, full), 200);
    }
    if (!(await scope.removeEducation(id, userActor(c, session.user.id))))
      throw notYours("qualification");
    return c.json(await fullProfile(c, db, session.user.id), 200);
  },
);

// ---------- Applications and saved jobs ----------

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/applications",
    summary: "Your applications",
    description:
      "Newest first, with where each is up to. Closed jobs stay listed, marked `closed`.",
    tags: TAGS,
    responses: {
      200: json(
        z.object({ items: z.array(MyApplicationSchema) }).openapi("MyApplications"),
        "Your applications",
      ),
      401: errors[401],
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const rows = await seeker(await c.get("db")(), session.user.id).applications();
    return c.json(
      {
        items: rows.map((row) => myApplicationJson(c.env, row)),
      },
      200,
    );
  },
);

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/v1/me/saved",
    summary: "Your saved jobs",
    description: "Newest first. Closed jobs stay listed, marked `closed`.",
    tags: TAGS,
    responses: {
      200: json(
        z.object({ items: z.array(JobSummarySchema) }).openapi("SavedJobs"),
        "Your saved jobs",
      ),
      401: errors[401],
    },
  }),
  async (c) => {
    const session = await requireUser(c);
    const rows = await seeker(await c.get("db")(), session.user.id).saved();
    return c.json({ items: rows.map((row) => jobSummaryJson(c.env, row)) }, 200);
  },
);

// ---------- Deleting the account ----------

meRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/v1/me",
    summary: "Delete your account",
    description:
      "Permanently deletes your account, profile, pictures, applications and checks, and signs you out everywhere. A salon you created is deleted with its jobs; a directory listing you claimed goes back to being unclaimed. Either way its Salon Plan is cancelled. This can't be undone.",
    tags: TAGS,
    responses: { 200: json(Deleted, "Deleted"), 401: errors[401] },
  }),
  async (c) => {
    const session = await requireUser(c);
    const db = await c.get("db")();
    if (c.get("dryRun")) return c.json({ deleted: true as const }, 200);
    // Their salons' plans are cancelled before anything is deleted: if Stripe can't be reached
    // the account stays, rather than a plan billing for a salon that's gone.
    if (c.env.STRIPE_SECRET_KEY) {
      try {
        for (const id of await salonsFor(db).soleOwnerSubscriptions(session.user.id)) {
          await cancelSubscription(c.env, id);
        }
      } catch {
        throw new ApiError("billing_unavailable", {
          detail: "Your salon's plan couldn't be cancelled just now, so nothing was deleted",
          hint: "Try again in a few minutes, or cancel the plan from the salon's Billing page first.",
        });
      }
    }
    const { mediaKeys, privateKeys } = await seeker(db, session.user.id).deleteAccount(
      userActor(c, session.user.id),
    );
    await Promise.all([
      deleteUploads(c.env, "public", mediaKeys),
      deleteUploads(c.env, "private", privateKeys),
    ]);
    return c.json({ deleted: true as const }, 200);
  },
);
