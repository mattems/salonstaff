import { educationSchema, experienceSchema, PROFILE_LIMITS } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  type MyProfile,
  NeedsProfile,
  SectionCard,
  useMyProfile,
  useRefresh,
} from "@/components/account-profile";
import {
  FormMessage,
  formText,
  parse,
  SubmitButton,
  TextAreaField,
  TextField,
  useAction,
} from "@/components/form";
import { QualificationItem } from "@/components/qualification-check";
import { api, unwrap } from "@/lib/api";
import { formatMonth } from "@/lib/format";
import { privatePage } from "@/lib/seo";

type Full = MyProfile;

export const Route = createFileRoute("/account/experience")({
  head: () => privatePage("Your experience and qualifications"),
  component: ExperiencePage,
});

function ExperiencePage() {
  const full = useMyProfile();
  if (!full) return <NeedsProfile />;
  return (
    <div className="space-y-6">
      <Experience full={full} />
      <Education full={full} />
    </div>
  );
}

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
    <SectionCard
      title="Qualifications"
      description="Certificates, diplomas and courses. Verify one with its certificate and it shows as verified on your profile."
    >
      <div className="space-y-4">
        {full.education.length > 0 && (
          <ul className="divide-y">
            {full.education.map((item) => (
              <QualificationItem
                key={item.id}
                item={item}
                actions={
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
                }
              />
            ))}
          </ul>
        )}
        {adding && full.education.length < PROFILE_LIMITS.education ? (
          <form
            className="grid gap-3"
            onSubmit={action.submit(
              async (form) => {
                const body = parse(educationSchema, formText(form));
                unwrap(await api.POST("/v1/me/education", { body }));
                await refresh("Qualification added");
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
                label="Where (optional)"
                name="institution"
                placeholder="TAFE NSW"
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
                Add qualification
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
