/**
 * Applying and saving on a job ad. What it offers comes from the API's `viewer` for this job:
 * `canApply`, or a `blocker` with a `reason`, so new rules on the API (D-08) show up here
 * without changes. Known blockers get a direct next step; any other shows its reason.
 */
import { applySchema } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@salonstaff/ui/components/card";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { signInPath } from "@/lib/session";
import { AppLink } from "./app-link";
import { FormMessage, formText, parse, SubmitButton, TextAreaField, useAction } from "./form";

type Viewer = Schemas["JobViewer"];

/** The next step for each reason someone can't apply. */
function nextStep(blocker: string, jobPath: string): { label: string; href: string } | null {
  switch (blocker) {
    case "login":
      return { label: "Sign in to apply", href: signInPath(jobPath) };
    case "employer":
      return { label: "Sign in as a job seeker", href: signInPath(jobPath) };
    case "profile":
      return { label: "Make your profile", href: `/account?next=${encodeURIComponent(jobPath)}` };
    case "verify":
    case "qualification":
      return { label: "Verify now", href: "/account/verify" };
    case "applied":
      return { label: "See your applications", href: "/applications" };
    case "closed":
      return null;
    default:
      return { label: "Go to your profile", href: "/account" };
  }
}

export function ApplyPanel({ job, viewer }: { job: Schemas["JobDetail"]; viewer: Viewer | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{job.closed ? "This job has closed" : "Apply for this job"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {viewer ? <ForViewer job={job} viewer={viewer} /> : <SignedOut job={job} />}
      </CardContent>
    </Card>
  );
}

function SignedOut({ job }: { job: Schemas["JobDetail"] }) {
  if (job.closed) {
    return <p className="text-muted-foreground text-sm">Applications are no longer open.</p>;
  }
  return (
    <>
      <p className="text-muted-foreground text-sm">
        Sign in or create a free account to apply. Your profile goes to {job.salon.name} with your
        application.
      </p>
      <Button asChild className="w-full">
        <Link to="/sign-in" search={{ next: job.path }}>
          Sign in to apply
        </Link>
      </Button>
    </>
  );
}

function ForViewer({ job, viewer }: { job: Schemas["JobDetail"]; viewer: Viewer }) {
  const [applied, setApplied] = useState(viewer.applied);
  return (
    <>
      {applied ? (
        <div className="space-y-2">
          <p className="font-medium">You've applied for this job.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/applications">See your applications</Link>
          </Button>
        </div>
      ) : viewer.canApply ? (
        <ApplyForm job={job} onApplied={() => setApplied(true)} />
      ) : (
        <Blocked job={job} viewer={viewer} />
      )}
      {!job.closed && <SaveButton job={job} saved={viewer.saved} />}
    </>
  );
}

function Blocked({ job, viewer }: { job: Schemas["JobDetail"]; viewer: Viewer }) {
  const step = viewer.blocker ? nextStep(viewer.blocker, job.path) : null;
  return (
    <div className="space-y-3">
      {viewer.reason && <p className="text-sm">{viewer.reason}</p>}
      {step && (
        <Button asChild className="w-full">
          <AppLink href={step.href}>{step.label}</AppLink>
        </Button>
      )}
    </div>
  );
}

function ApplyForm({ job, onApplied }: { job: Schemas["JobDetail"]; onApplied: () => void }) {
  const action = useAction();
  return (
    <form
      className="space-y-3"
      onSubmit={action.submit(async (form) => {
        const body = parse(applySchema, formText(form));
        unwrap(await api.POST("/v1/jobs/{id}/apply", { params: { path: { id: job.id } }, body }));
        toast.success(`Application sent to ${job.salon.name}`);
        onApplied();
      })}
    >
      <TextAreaField
        label="Cover note (optional)"
        name="coverNote"
        rows={5}
        maxLength={1500}
        hint="A few lines about why you'd be great for this role."
        error={action.errors.coverNote}
      />
      <FormMessage message={action.message} />
      <SubmitButton pending={action.pending} className="w-full">
        Apply now
      </SubmitButton>
      <p className="text-muted-foreground text-xs">
        {job.salon.name} will see your profile, verification and contact details.
      </p>
    </form>
  );
}

function SaveButton({ job, saved: initial }: { job: Schemas["JobDetail"]; saved: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function toggle() {
    setPending(true);
    try {
      const options = { params: { path: { id: job.id } } };
      const result = unwrap(
        saved
          ? await api.DELETE("/v1/jobs/{id}/save", options)
          : await api.POST("/v1/jobs/{id}/save", options),
      );
      setSaved(result.saved);
      toast.success(result.saved ? "Saved" : "Removed from saved jobs");
      void router.invalidate();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <Button variant="outline" className="w-full" onClick={toggle} disabled={pending}>
      {saved ? "Saved: remove" : "Save for later"}
    </Button>
  );
}
