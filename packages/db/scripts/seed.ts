/**
 * Demo data for local development (`bun run db:seed`, also run by `bun run setup`). Safe to run
 * again: anything already there is left alone. Refuses to run against a database that isn't local.
 *
 * - Six salons with live jobs, owned by owner1@salonstaff.test … owner6@salonstaff.test
 * - Unclaimed directory listings (some with a business email, to try claiming by link)
 * - A job seeker, seeker@salonstaff.test, with a public profile, a verified mobile and an
 *   endorsement from owner1 (not yet ID-verified, to try the check)
 * - A staff owner for the admin portal, from STAFF_EMAIL
 *
 * Sign in as any of them with the dev login (the springboard lists them). The ABNs and businesses
 * are made up.
 */
import {
  type AuState,
  type EmploymentType,
  educationSchema,
  endorsementSchema,
  experienceSchema,
  isValidAbn,
  type JobRole,
  jobInputSchema,
  type PayPeriod,
  randomToken,
  salonSchema,
  sha256Hex,
  uuidv7,
} from "@salonstaff/shared";
import { and, eq, isNull } from "drizzle-orm";
import {
  connect,
  type Db,
  publicProfiles,
  salonScope,
  salonsFor,
  seeker,
  staffOffice,
} from "../src/index";
import { jobs, salons, users } from "../src/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `bun run setup` to create .env.");
  process.exit(1);
}
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  console.error("Refusing to seed a database that is not local.");
  process.exit(1);
}

const actor = { type: "system" as const };
const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedJob {
  title: string;
  role: JobRole;
  type: EmploymentType;
  pay: [number | null, number | null, PayPeriod];
  description: string;
  requirements?: string;
  featured?: boolean;
  requireQualification?: boolean;
}

interface SeedSalon {
  name: string;
  suburb: string;
  state: AuState;
  postcode: string;
  abn: string;
  about: string;
  jobs: SeedJob[];
}

const SALONS: SeedSalon[] = [
  {
    name: "Willow & Ash Hair",
    suburb: "Surry Hills",
    state: "NSW",
    postcode: "2010",
    abn: "51824753556",
    about:
      "A calm, plant-filled colour studio. We're a sustainable salon and we invest heavily in education: every stylist gets a paid education day each quarter.",
    jobs: [
      {
        title: "Senior Colourist (blonding specialist)",
        role: "colourist",
        type: "full_time",
        pay: [38, 45, "hour"],
        featured: true,
        requireQualification: true,
        description:
          "We're looking for a senior colourist who lives for lived-in blondes and seamless balayage.\n\nYou'll have a full column from day one (we have a 6-week waitlist), a dedicated assistant on Saturdays, and a commission structure that rewards rebooking and retail.\n\nFour-day week available.",
        requirements:
          "5+ years behind the chair\nStrong foiling and freehand technique\nCert III in Hairdressing",
      },
      {
        title: "Apprentice Hairdresser (1st or 2nd year)",
        role: "apprentice_hair",
        type: "apprenticeship",
        pay: [null, null, "hour"],
        description:
          "Start your career in a salon that actually teaches. Weekly in-salon training nights, model days and a clear path to the floor.\n\nWe'll support your TAFE training and pay above award.",
      },
    ],
  },
  {
    name: "The Fade Room",
    suburb: "Fitzroy",
    state: "VIC",
    postcode: "3065",
    abn: "33102417032",
    about: "Barbershop, coffee and good music. Busy walk-in and booking trade seven days.",
    jobs: [
      {
        title: "Experienced Barber",
        role: "barber",
        type: "full_time",
        pay: [32, 40, "hour"],
        featured: true,
        description:
          "We need a confident barber who can handle a busy Saturday. Skin fades, scissor work and beard shaping are your bread and butter.\n\nGreat crew, weekly pay, and a cut of product sales.",
      },
      {
        title: "Chair rental: Fitzroy barbershop",
        role: "barber",
        type: "chair_rental",
        pay: [350, 350, "week"],
        description:
          "One chair available in a high-foot-traffic shop on Brunswick St. Bring your own clients or build from our walk-ins.",
      },
    ],
  },
  {
    name: "Lumière Skin & Beauty",
    suburb: "Paddington",
    state: "QLD",
    postcode: "4064",
    abn: "53004085616",
    about:
      "Advanced skin clinic offering cosmeceutical facials, LED and skin needling. Small, supportive team.",
    jobs: [
      {
        title: "Dermal Therapist",
        role: "skin_therapist",
        type: "full_time",
        pay: [75000, 85000, "year"],
        requireQualification: true,
        description:
          "Join our clinic as a dermal therapist performing skin needling, peels and LED treatments. Full product training provided.\n\nMonday to Friday plus one Saturday a month.",
        requirements: "Diploma of Beauty Therapy or Bachelor of Dermal Science\n2+ years in clinic",
      },
      {
        title: "Beauty Therapist (part time)",
        role: "beauty_therapist",
        type: "part_time",
        pay: [31, 35, "hour"],
        description: "Waxing, tinting, facials and massage. 3 days a week including Saturdays.",
      },
    ],
  },
  {
    name: "Polished Nail Bar",
    suburb: "Subiaco",
    state: "WA",
    postcode: "6008",
    abn: "12004044937",
    about: "Clean, modern nail bar specialising in structured manicures and nail art.",
    jobs: [
      {
        title: "Nail Technician (BIAB and nail art)",
        role: "nail_technician",
        type: "casual",
        pay: [30, 36, "hour"],
        description:
          "Casual shifts available Thursday to Sunday. You'll need solid gel and BIAB skills; nail art a bonus. Kit and products supplied.",
      },
      {
        title: "Salon Coordinator",
        role: "receptionist",
        type: "part_time",
        pay: [29, 31, "hour"],
        description:
          "Run the front desk: bookings, rebooking, retail and keeping our socials ticking. Experience with Fresha or Timely preferred.",
      },
    ],
  },
  {
    name: "Arbour Hair Collective",
    suburb: "Norwood",
    state: "SA",
    postcode: "5067",
    abn: "49008670576",
    about: "Award-winning collective of 12 stylists. We're growing into a second salon in 2027.",
    jobs: [
      {
        title: "Salon Manager",
        role: "salon_manager",
        type: "full_time",
        pay: [80000, 95000, "year"],
        description:
          "Lead a team of 12 and help us open our second location. You'll own rostering, KPIs, team development and the client experience.",
        requirements: "Previous salon management experience\nStrong with numbers and people",
      },
      {
        title: "Hair Stylist",
        role: "stylist",
        type: "full_time",
        pay: [30, 36, "hour"],
        description:
          "Qualified stylist wanted for a busy, friendly salon. Cutting and colour all-rounder. Kevin Murphy and Davines salon.",
      },
    ],
  },
  {
    name: "Brow Theory",
    suburb: "Braddon",
    state: "ACT",
    postcode: "2612",
    abn: "51824753556",
    about: "Canberra's specialist lash and brow studio.",
    jobs: [
      {
        title: "Lash & Brow Technician",
        role: "lash_brow",
        type: "full_time",
        pay: [30, 34, "hour"],
        description:
          "Lash lifts, brow lamination, henna brows and lash extensions. We'll train the right person in our signature brow shaping.",
      },
    ],
  },
];

/** Unclaimed directory listings, to try the claim flow. */
const DIRECTORY: {
  name: string;
  suburb: string;
  state: AuState;
  postcode: string;
  email?: string;
  phone?: string;
  abn?: string;
  about?: string;
}[] = [
  {
    name: "Copper & Comb",
    suburb: "Newtown",
    state: "NSW",
    postcode: "2042",
    email: "hello@copperandcomb.test",
    phone: "02 9000 1111",
    abn: "53004085616",
    about: "Neighbourhood hair studio specialising in lived-in colour.",
  },
  {
    name: "Saltwater Barbers",
    suburb: "Manly",
    state: "NSW",
    postcode: "2095",
    phone: "02 9000 2222",
    about: "Classic cuts and hot towel shaves by the beach.",
  },
  {
    name: "Velvet Lash Lounge",
    suburb: "South Yarra",
    state: "VIC",
    postcode: "3141",
    email: "bookings@velvetlash.test",
  },
  {
    name: "Golden Hour Beauty",
    suburb: "New Farm",
    state: "QLD",
    postcode: "4005",
    email: "team@goldenhour.test",
    about: "Brows, lashes, skin and spray tans.",
  },
  { name: "The Parlour Hair Co.", suburb: "Leederville", state: "WA", postcode: "6007" },
];

async function userByEmail(db: Db, email: string, name: string, role: "seeker" | "employer") {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return { user: existing, created: false };
  const [user] = await db
    .insert(users)
    .values({ id: uuidv7(), email, name, emailVerified: true, role })
    .returning();
  return { user: user as typeof users.$inferSelect, created: true };
}

async function seedSalons(db: Db): Promise<number> {
  let created = 0;
  for (const [i, s] of SALONS.entries()) {
    const { user: owner } = await userByEmail(
      db,
      `owner${i + 1}@salonstaff.test`,
      "Demo Owner",
      "employer",
    );
    if ((await salonsFor(db).ofUser(owner.id)).length > 0) continue;
    if (!isValidAbn(s.abn)) throw new Error(`The demo ABN for ${s.name} doesn't pass the checksum`);
    const input = salonSchema.parse({
      name: s.name,
      abn: s.abn,
      contactName: "Demo Owner",
      phone: "0290000000",
      suburb: s.suburb,
      state: s.state,
      postcode: s.postcode,
      about: s.about,
    });
    const salon = await salonsFor(db).create(
      owner.id,
      input,
      { status: "verified", entityName: s.name },
      actor,
    );
    const scope = salonScope(db, salon.id);
    for (const [j, job] of s.jobs.entries()) {
      const draft = await scope.createJob(
        jobInputSchema.parse({
          title: job.title,
          role: job.role,
          employmentType: job.type,
          payMin: job.pay[0] ?? undefined,
          payMax: job.pay[1] ?? undefined,
          payPeriod: job.pay[2],
          suburb: s.suburb,
          state: s.state,
          postcode: s.postcode,
          description: job.description,
          requirements: job.requirements,
          requireQualification: job.requireQualification ?? false,
        }),
        actor,
      );
      await scope.publish(draft.id, actor);
      // Spread the dates out, so the feed has an order to show.
      const publishedAt = new Date(Date.now() - (i * 2 + j) * DAY_MS * 0.7);
      await db
        .update(jobs)
        .set({
          featured: job.featured ?? false,
          publishedAt,
          expiresAt: new Date(publishedAt.getTime() + 30 * DAY_MS),
        })
        .where(eq(jobs.id, draft.id));
      created++;
    }
  }
  return created;
}

async function seedDirectory(db: Db): Promise<number> {
  let created = 0;
  for (const listing of DIRECTORY) {
    const [existing] = await db
      .select({ id: salons.id })
      .from(salons)
      .where(and(eq(salons.name, listing.name), eq(salons.source, "directory")));
    if (existing) continue;
    await salonsFor(db).addListing(listing, actor);
    created++;
  }
  return created;
}

async function seedSeeker(db: Db): Promise<boolean> {
  const { user } = await userByEmail(db, "seeker@salonstaff.test", "Jess Demo", "seeker");
  const me = seeker(db, user.id);
  if (await me.profile()) return false;
  await me.saveProfile(
    {
      firstName: "Jess",
      lastName: "Demo",
      headline: "Colourist with 6 years behind the chair",
      about:
        "Lived-in blondes, vivids and colour corrections. Looking for a team that loves education.",
      suburb: "Marrickville",
      state: "NSW",
      postcode: "2204",
      roles: ["colourist", "stylist"],
      yearsExperience: 6,
      instagram: "jess.does.colour",
      tiktok: undefined,
      rightToWork: "citizen",
      openToWork: true,
    },
    actor,
  );
  await me.saveDetails(
    {
      specialties: ["Balayage", "Blonding", "Colour correction"],
      brands: ["Olaplex", "Redken"],
      availableDays: ["tue", "wed", "thu", "fri", "sat"],
      employmentTypes: ["full_time", "part_time"],
      travelKm: 15,
      payMin: 35,
      payPeriod: "hour",
    },
    actor,
  );
  await me.addExperience(
    experienceSchema.parse({
      salonName: "Inner West Hair",
      title: "Colourist",
      location: "Newtown NSW",
      startMonth: "2021-03",
      description: "Full column of colour clients; trained the apprentices in foiling.",
    }),
    actor,
  );
  await me.addEducation(
    educationSchema.parse({
      qualification: "Cert III in Hairdressing",
      institution: "TAFE NSW",
      year: 2019,
    }),
    actor,
  );
  return true;
}

async function seedStaff(db: Db): Promise<string | null> {
  const email = process.env.STAFF_EMAIL?.trim();
  if (!email || email === "you@example.com") return null;
  const office = staffOffice(db);
  if (await office.staff.findActive(email)) return null;
  await office.staff.add(
    {
      name: email.split("@")[0] as string,
      email,
      role: "owner",
      reason: "Seeded for local development",
    },
    actor,
  );
  return email;
}

/**
 * What D-13 added to the demo job seeker, for a database seeded before it: a verified mobile, a
 * public profile and an endorsement from owner1. Each part only if it's missing.
 */
async function seedSeekerSharing(db: Db): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.email, "seeker@salonstaff.test"));
  if (!user) return;
  await db
    .update(users)
    .set({ phoneNumber: "+61400000001", phoneNumberVerified: true })
    .where(and(eq(users.id, user.id), isNull(users.phoneNumber)));
  const me = seeker(db, user.id);
  const profile = await me.profile();
  if (!profile) return;
  if (!profile.shareCode) await me.saveSettings({ visibility: "public" }, actor);
  if ((await me.endorsements()).length > 0) return;
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await me.requestEndorsement(
    { refereeName: "Demo Owner", refereeEmail: "owner1@salonstaff.test", note: undefined },
    tokenHash,
    actor,
  );
  const { endorsement } = await publicProfiles(db).write(
    tokenHash,
    endorsementSchema.parse({
      name: "Demo Owner",
      title: "Salon owner",
      salonName: "Inner West Hair",
      relationship: "managed",
      body: "Jess was our go-to colourist for three years. Clients followed her, apprentices learned from her, and she never left a foil unfinished.",
      contactOk: true,
      phone: "0290000000",
    }),
    actor,
  );
  await me.showEndorsement(endorsement.id, true, actor);
}

const { db, close } = await connect(url);
try {
  const listings = await seedDirectory(db);
  const jobsMade = await seedSalons(db);
  const seekerMade = await seedSeeker(db);
  await seedSeekerSharing(db);
  const staffMade = await seedStaff(db);
  console.log(
    `• Seeded ${jobsMade} jobs, ${listings} directory listings${seekerMade ? ", the demo job seeker" : ""}${staffMade ? `, staff owner ${staffMade}` : ""}`,
  );
} finally {
  await close();
}
