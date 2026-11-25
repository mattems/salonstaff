/**
 * The job search form. Role, state and suburb alone go to their landing page
 * (`/jobs/colourist/nsw/surry-hills`), the address search engines know; a keyword, an employment
 * type or a suburb without a state searches `/jobs?…`.
 */

import type { AuState, EmploymentType, JobRole } from "@salonstaff/shared";
import {
  AU_STATES,
  EMPLOYMENT_TYPES,
  JOB_ROLES,
  jobsLandingPath,
  slugify,
} from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { selectClass } from "./form";

export interface JobSearchValues {
  q?: string | undefined;
  role?: JobRole | undefined;
  state?: AuState | undefined;
  type?: EmploymentType | undefined;
  /** A suburb's slug (`surry-hills`). */
  suburb?: string | undefined;
  /** How to show the suburb in the form ("Surry Hills"), when known. Not part of the address. */
  suburbName?: string | undefined;
}

/** Where a search goes. */
export function searchHref(values: JobSearchValues): string {
  const { q, role, state, type, suburb } = values;
  if (!q && !type && (!suburb || state))
    return jobsLandingPath({ role, state, suburbSlug: suburb });
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (role) params.set("role", role);
  if (state) params.set("state", state);
  if (suburb) params.set("suburb", suburb);
  if (type) params.set("type", type);
  return `/jobs?${params}`;
}

export function JobSearch({
  values = {},
  showType = true,
}: {
  values?: JobSearchValues;
  showType?: boolean;
}) {
  const navigate = useNavigate();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };
    const suburb = text("suburb");
    void navigate({
      href: searchHref({
        q: text("q"),
        role: text("role") as JobRole | undefined,
        state: text("state") as AuState | undefined,
        type: text("type") as EmploymentType | undefined,
        suburb: suburb ? slugify(suburb) || undefined : undefined,
      }),
    });
  }
  return (
    <search>
      <form
        action="/jobs"
        onSubmit={onSubmit}
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]"
      >
        <Input
          name="q"
          placeholder="Job title, salon, suburb or postcode"
          aria-label="Keywords"
          defaultValue={values.q}
        />
        <select
          name="role"
          aria-label="Role"
          className={selectClass}
          defaultValue={values.role ?? ""}
        >
          <option value="">All roles</option>
          {JOB_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <Input
          name="suburb"
          placeholder="Suburb"
          aria-label="Suburb"
          className="sm:w-40"
          defaultValue={values.suburbName ?? values.suburb?.replace(/-/g, " ")}
        />
        <select
          name="state"
          aria-label="State"
          className={selectClass}
          defaultValue={values.state ?? ""}
        >
          <option value="">All states</option>
          {AU_STATES.map((state) => (
            <option key={state.value} value={state.value}>
              {state.value}
            </option>
          ))}
        </select>
        {showType && (
          <select
            name="type"
            aria-label="Employment type"
            className={selectClass}
            defaultValue={values.type ?? ""}
          >
            <option value="">Any type</option>
            {EMPLOYMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        )}
        <Button type="submit">Search</Button>
      </form>
    </search>
  );
}
