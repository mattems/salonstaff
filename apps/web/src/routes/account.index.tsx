import {
  AU_STATES,
  EMPLOYMENT_TYPES,
  educationSchema,
  experienceSchema,
  JOB_ROLES,
  PROFILE_LIMITS,
  profileDetailsSchema,
  RIGHT_TO_WORK,
  SPECIALTIES,
  seekerProfileSchema,
  WEEKDAYS,
} from "@salonstaff/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@salonstaff/ui/components/alert-dialog";
import { Button } from "@salonstaff/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@salonstaff/ui/components/card";
import { Input } from "@salonstaff/ui/components/input";
import { Progress } from "@salonstaff/ui/components/progress";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { AppLink } from "@/components/app-link";
import {
  CheckboxField,
  CheckboxGroup,
  FormError,
  FormMessage,
  formList,
  formText,
  parse,
  SelectField,
  SubmitButton,
  splitList,
  TextAreaField,
  TextField,
  useAction,
} from "@/components/form";
import { Notice, PageHeader } from "@/components/page";
import { api, errorMessage, type FullProfile, multipart, orNull, unwrap } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { privatePage } from "@/lib/seo";
import { forgetMe, safeNext } from "@/lib/session";

type Full = FullProfile;

export const Route = createFileRoute("/account/")({
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search.next),
  }),
  loader: async () => {
    const full = orNull(await api.GET("/v1/me/profile"));
    return { full };
  },
  head: () => privatePage("Your profile"),
  component: AccountPage,
});

function useRefresh() {
  const router = useRouter();
  return async (message?: string) => {
    if (message) toast.success(message);
    forgetMe();
    await router.invalidate();
  };
}

function AccountPage() {
  const { full } = Route.useLoaderData();
  const { me } = Route.useRouteContext();
  const { next } = Route.useSearch();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your profile"
        description="Salons see this when you apply. The more you add, the better your chances."
        actions={
          full && (
            <Button asChild variant="outline">
              <AppLink href="/account/profile">Preview as a salon</AppLink>
            </Button>
          )
        }
      />
      {next && full && (
        <Notice title="Profile saved">
          <AppLink href={next} className="underline">
            Go back to where you were
          </AppLink>
        </Notice>
      )}
      {full && <Strength full={full} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Basics full={full} fallbackPhone={me.phoneNumber} />
        {full ? (
          <div className="space-y-6">
            <Photo full={full} />
            <Details full={full} />
          </div>
        ) : (
          <Notice title="Start with your basics">
            Save your name, location and roles first. Then add a photo, skills, portfolio,
            experience and education.
          </Notice>
        )}
      </div>
      {full && (
        <>
          <Portfolio full={full} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Experience full={full} />
            <Education full={full} />
          </div>
        </>
      )}
      <DeleteAccount />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

function strengthOf(full: Full) {
  const { profile: p } = full;
  const parts: [string, number, boolean][] = [
    ["Your basics", 20, true],
    ["A profile photo", 10, Boolean(p.photoUrl)],
    ["A headline and a few words about you", 10, Boolean(p.headline && p.about)],
    ["Your specialties", 10, p.specialties.length > 0],
    ["When you can work", 10, p.availableDays.length > 0 || p.employmentTypes.length > 0],
    ["At least 3 portfolio photos", 15, full.portfolio.length >= 3],
    ["Your experience", 10, full.experience.length > 0],
    ["Your education", 5, full.education.length > 0],
    ["A verified identity", 10, full.verification.identity === "verified"],
  ];
  const score = parts.reduce((sum, [, points, done]) => sum + (done ? points : 0), 0);
  return { score, missing: parts.filter(([, , done]) => !done).map(([label]) => label) };
}

function Strength({ full }: { full: Full }) {
  const { score, missing } = strengthOf(full);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile strength: {score}%</CardTitle>
        {missing.length > 0 && (
          <CardDescription>Still to add: {missing.join(", ").toLowerCase()}.</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <Progress value={score} aria-label="Profile strength" />
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

function Basics({ full, fallbackPhone }: { full: Full | null; fallbackPhone: string | null }) {
  const p = full?.profile;
  const refresh = useRefresh();
  const action = useAction();
  const e = action.errors;
  return (
    <SectionCard title="Basics" description="Your name, where you are and the roles you're after.">
      <form
        className="grid gap-4"
        onSubmit={action.submit(async (form) => {
          const body = parse(seekerProfileSchema, {
            ...formText(form),
            roles: formList(form, "roles"),
            openToWork: form.get("openToWork") === "on",
          });
          unwrap(await api.PUT("/v1/me/profile", { body }));
          await refresh("Profile saved");
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            name="firstName"
            defaultValue={p?.firstName}
            required
            error={e.firstName}
          />
          <TextField
            label="Last name"
            name="lastName"
            defaultValue={p?.lastName}
            required
            error={e.lastName}
          />
        </div>
        <TextField
          label="Mobile"
          name="phone"
          type="tel"
          defaultValue={p?.phone ?? fallbackPhone ?? ""}
          hint="Salons you apply to can call you."
          error={e.phone}
        />
        <TextField
          label="Headline"
          name="headline"
          defaultValue={p?.headline ?? ""}
          placeholder="Senior colourist, balayage specialist"
          maxLength={120}
          error={e.headline}
        />
        <TextAreaField
          label="About you"
          name="about"
          rows={4}
          defaultValue={p?.about ?? ""}
          maxLength={2000}
          error={e.about}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Suburb"
            name="suburb"
            defaultValue={p?.suburb}
            required
            error={e.suburb}
          />
          <SelectField
            label="State"
            name="state"
            options={AU_STATES.map((s) => ({ value: s.value, label: s.value }))}
            defaultValue={p?.state ?? ""}
            placeholder="Choose"
            error={e.state}
          />
          <TextField
            label="Postcode"
            name="postcode"
            inputMode="numeric"
            maxLength={4}
            defaultValue={p?.postcode}
            required
            error={e.postcode}
          />
        </div>
        <CheckboxGroup
          label="Roles you're after (up to 6)"
          name="roles"
          options={JOB_ROLES}
          defaultValues={p?.roles ?? []}
          error={e.roles}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Years of experience"
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={p?.yearsExperience ?? 0}
            error={e.yearsExperience}
          />
          <TextField
            label="Instagram"
            name="instagram"
            defaultValue={p?.instagram ?? ""}
            placeholder="yourhandle"
            error={e.instagram}
          />
        </div>
        <TextField
          label="Qualifications"
          name="qualifications"
          defaultValue={p?.qualifications ?? ""}
          placeholder="Cert III in Hairdressing"
          error={e.qualifications}
        />
        <SelectField
          label="Right to work in Australia"
          name="rightToWork"
          options={RIGHT_TO_WORK}
          defaultValue={p?.rightToWork ?? ""}
          placeholder="Choose"
          error={e.rightToWork}
        />
        <CheckboxField
          label="I'm open to work"
          name="openToWork"
          defaultChecked={p?.openToWork ?? true}
        />
        <FormMessage message={action.message} />
        <div>
          <SubmitButton pending={action.pending}>
            {full ? "Save basics" : "Create my profile"}
          </SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

function Photo({ full }: { full: Full }) {
  const refresh = useRefresh();
  const action = useAction();
  const { photoUrl, firstName } = full.profile;
  return (
    <SectionCard
      title="Photo"
      description="A clear, friendly photo of you. JPG, PNG, WebP or HEIC, up to 8MB."
    >
      <div className="flex items-start gap-4">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={firstName}
            className="size-20 rounded-full border object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-full border text-muted-foreground text-xs">
            No photo
          </div>
        )}
        <form
          className="grid flex-1 gap-2"
          onSubmit={action.submit(async (form) => {
            const file = form.get("file");
            if (!(file instanceof File) || file.size === 0)
              throw new FormError("Choose a photo first");
            unwrap(await api.POST("/v1/me/photo", multipart(form)));
            await refresh("Photo saved");
          })}
        >
          <Input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            aria-label="Photo"
          />
          <FormMessage message={action.message} />
          <div className="flex gap-2">
            <SubmitButton pending={action.pending} size="sm">
              Upload
            </SubmitButton>
            {photoUrl && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    unwrap(await api.DELETE("/v1/me/photo"));
                    await refresh("Photo removed");
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Skills and availability
// ---------------------------------------------------------------------------

const ALL_SPECIALTIES: string[] = SPECIALTIES.flatMap((group) => [...group.items]);

function Details({ full }: { full: Full }) {
  const p = full.profile;
  const refresh = useRefresh();
  const action = useAction();
  const custom = p.specialties.filter((s) => !ALL_SPECIALTIES.includes(s));
  return (
    <SectionCard title="Skills and availability">
      <form
        className="grid gap-4"
        onSubmit={action.submit(async (form) => {
          const text = formText(form);
          const body = parse(profileDetailsSchema, {
            specialties: [...formList(form, "specialties"), ...splitList(text.otherSpecialties)],
            brands: splitList(text.brands),
            availableDays: formList(form, "availableDays"),
            employmentTypes: formList(form, "employmentTypes"),
            availableFrom: text.availableFrom ?? "",
            travelKm: text.travelKm,
            payExpectation: text.payExpectation,
          });
          unwrap(await api.PUT("/v1/me/profile/details", { body }));
          await refresh("Skills and availability saved");
        })}
      >
        <details className="space-y-3">
          <summary className="cursor-pointer font-medium text-sm">
            Specialties ({p.specialties.length} chosen, up to {PROFILE_LIMITS.specialties})
          </summary>
          {SPECIALTIES.map((group) => (
            <CheckboxGroup
              key={group.group}
              label={group.group}
              name="specialties"
              options={group.items.map((item) => ({ value: item, label: item }))}
              defaultValues={p.specialties}
              columns={2}
            />
          ))}
        </details>
        <TextField
          label="Other specialties"
          name="otherSpecialties"
          defaultValue={custom.join(", ")}
          hint="Separate them with commas."
          error={action.errors.specialties}
        />
        <TextField
          label="Brands and products you're trained in"
          name="brands"
          defaultValue={p.brands.join(", ")}
          hint="Separate them with commas."
          error={action.errors.brands}
        />
        <CheckboxGroup
          label="Days you can work"
          name="availableDays"
          options={WEEKDAYS}
          defaultValues={p.availableDays}
          columns={4}
        />
        <CheckboxGroup
          label="Work you're after"
          name="employmentTypes"
          options={EMPLOYMENT_TYPES}
          defaultValues={p.employmentTypes}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Can start from"
            name="availableFrom"
            type="date"
            defaultValue={p.availableFrom ?? ""}
            error={action.errors.availableFrom}
          />
          <TextField
            label="Will travel (km)"
            name="travelKm"
            type="number"
            min={0}
            max={500}
            defaultValue={p.travelKm ?? ""}
            error={action.errors.travelKm}
          />
          <TextField
            label="Pay expectation"
            name="payExpectation"
            defaultValue={p.payExpectation ?? ""}
            placeholder="$35/hr"
            error={action.errors.payExpectation}
          />
        </div>
        <FormMessage message={action.message} />
        <div>
          <SubmitButton pending={action.pending}>Save skills and availability</SubmitButton>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

function Portfolio({ full }: { full: Full }) {
  const refresh = useRefresh();
  const action = useAction();
  const full_ = full.portfolio.length >= PROFILE_LIMITS.portfolio;
  return (
    <SectionCard
      title="Portfolio"
      description={`Photos of your work, up to ${PROFILE_LIMITS.portfolio}. ${full.portfolio.length} so far.`}
    >
      <div className="space-y-4">
        {full.portfolio.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {full.portfolio.map((item) => (
              <li key={item.id} className="space-y-1">
                <img
                  src={item.imageUrl}
                  alt={item.caption ?? "Portfolio photo"}
                  className="aspect-square w-full rounded-lg border object-cover"
                />
                {item.caption && <p className="text-muted-foreground text-xs">{item.caption}</p>}
                <Button
                  size="xs"
                  variant="outline"
                  disabled={action.pending}
                  onClick={() =>
                    action.run(async () => {
                      unwrap(
                        await api.DELETE("/v1/me/portfolio/{id}", {
                          params: { path: { id: item.id } },
                        }),
                      );
                      await refresh("Photo removed");
                    })
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!full_ && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={action.submit(
              async (form) => {
                const file = form.get("file");
                if (!(file instanceof File) || file.size === 0)
                  throw new FormError("Choose a photo first");
                if (!String(form.get("caption") ?? "").trim()) form.delete("caption");
                unwrap(await api.POST("/v1/me/portfolio", multipart(form)));
                await refresh("Photo added");
              },
              { reset: true },
            )}
          >
            <Input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              aria-label="Portfolio photo"
            />
            <Input
              name="caption"
              maxLength={140}
              placeholder="Caption (optional)"
              aria-label="Caption"
            />
            <SubmitButton pending={action.pending}>Add photo</SubmitButton>
          </form>
        )}
        <FormMessage message={action.message} />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Experience and education
// ---------------------------------------------------------------------------

function Experience({ full }: { full: Full }) {
  const refresh = useRefresh();
  const action = useAction();
  const [adding, setAdding] = useState(full.experience.length === 0);
  return (
    <SectionCard title="Experience" description="Most recent first.">
      <div className="space-y-4">
        <ul className="space-y-3">
          {full.experience.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{item.title}</p>
                <p>
                  {item.salonName}
                  {item.location && (
                    <span className="text-muted-foreground"> · {item.location}</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {formatMonth(item.startMonth)} – {formatMonth(item.endMonth)}
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    unwrap(
                      await api.DELETE("/v1/me/experience/{id}", {
                        params: { path: { id: item.id } },
                      }),
                    );
                    await refresh("Removed");
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {adding && full.experience.length < PROFILE_LIMITS.experience ? (
          <form
            className="grid gap-3"
            onSubmit={action.submit(
              async (form) => {
                const body = parse(experienceSchema, formText(form));
                unwrap(await api.POST("/v1/me/experience", { body }));
                await refresh("Experience added");
              },
              { reset: true },
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Job title" name="title" required error={action.errors.title} />
              <TextField label="Salon" name="salonName" required error={action.errors.salonName} />
            </div>
            <TextField label="Where (optional)" name="location" error={action.errors.location} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Started"
                name="startMonth"
                type="month"
                required
                error={action.errors.startMonth}
              />
              <TextField
                label="Finished"
                name="endMonth"
                type="month"
                hint="Leave blank if you're still there."
                error={action.errors.endMonth}
              />
            </div>
            <TextAreaField
              label="What you did (optional)"
              name="description"
              rows={3}
              maxLength={1000}
              error={action.errors.description}
            />
            <FormMessage message={action.message} />
            <div>
              <SubmitButton pending={action.pending} size="sm">
                Add experience
              </SubmitButton>
            </div>
          </form>
        ) : (
          full.experience.length < PROFILE_LIMITS.experience && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              Add a role
            </Button>
          )
        )}
      </div>
    </SectionCard>
  );
}

function Education({ full }: { full: Full }) {
  const refresh = useRefresh();
  const action = useAction();
  const [adding, setAdding] = useState(full.education.length === 0);
  return (
    <SectionCard title="Education" description="Qualifications and courses.">
      <div className="space-y-4">
        <ul className="space-y-3">
          {full.education.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{item.qualification}</p>
                <p className="text-muted-foreground">
                  {item.institution}
                  {item.year && ` · ${item.year}`}
                </p>
              </div>
              <Button
                size="xs"
                variant="outline"
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    unwrap(
                      await api.DELETE("/v1/me/education/{id}", {
                        params: { path: { id: item.id } },
                      }),
                    );
                    await refresh("Removed");
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {adding && full.education.length < PROFILE_LIMITS.education ? (
          <form
            className="grid gap-3"
            onSubmit={action.submit(
              async (form) => {
                const body = parse(educationSchema, formText(form));
                unwrap(await api.POST("/v1/me/education", { body }));
                await refresh("Education added");
              },
              { reset: true },
            )}
          >
            <TextField
              label="Qualification or course"
              name="qualification"
              required
              error={action.errors.qualification}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <TextField
                label="Where"
                name="institution"
                required
                error={action.errors.institution}
              />
              <TextField
                label="Year"
                name="year"
                type="number"
                min={1960}
                max={2100}
                error={action.errors.year}
              />
            </div>
            <FormMessage message={action.message} />
            <div>
              <SubmitButton pending={action.pending} size="sm">
                Add education
              </SubmitButton>
            </div>
          </form>
        ) : (
          full.education.length < PROFILE_LIMITS.education && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              Add a qualification
            </Button>
          )
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Deleting the account
// ---------------------------------------------------------------------------

function DeleteAccount() {
  const navigate = useNavigate();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function remove() {
    setPending(true);
    try {
      unwrap(await api.DELETE("/v1/me"));
      forgetMe();
      toast.success("Your account has been deleted");
      await navigate({ to: "/" });
      await router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  }
  return (
    <SectionCard
      title="Delete your account"
      description="Deletes your account, profile, photos, applications and checks, and signs you out everywhere. This can't be undone."
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete my account</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything goes: your profile, photos, applications and verification. Salons you
              applied to lose your details. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={remove}>
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
