/**
 * Small form helpers on top of the shadcn inputs. Forms are plain <form> elements read with
 * FormData, checked with the shared zod schemas first, then sent to the API; field messages
 * come from either.
 */
import { Alert, AlertDescription } from "@salonstaff/ui/components/alert";
import { Button } from "@salonstaff/ui/components/button";
import { Checkbox } from "@salonstaff/ui/components/checkbox";
import { Input } from "@salonstaff/ui/components/input";
import { Label } from "@salonstaff/ui/components/label";
import { Spinner } from "@salonstaff/ui/components/spinner";
import { Textarea } from "@salonstaff/ui/components/textarea";
import { cn } from "@salonstaff/ui/lib/utils";
import { type ComponentProps, type FormEvent, type ReactNode, useId, useState } from "react";
import type { z } from "zod";
import { ApiProblem, errorMessage } from "@/lib/api";

export type FieldErrors = Record<string, string>;

/** Thrown by `parse` when the shared schema rejects the form. */
export class InvalidForm extends Error {
  constructor(readonly fields: FieldErrors) {
    super(Object.values(fields)[0] ?? "Check the form");
  }
}

/** A problem to tell the person in so many words (a missing file, say). */
export class FormError extends Error {}

/** Checks values against a shared schema, as the API will. */
export function parse<T extends z.ZodType>(schema: T, values: unknown): z.output<T> {
  const result = schema.safeParse(values);
  if (result.success) return result.data;
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "form";
    fields[path] ??= issue.message;
  }
  throw new InvalidForm(fields);
}

/** The form's text fields, trimmed; blank ones left out. */
export function formText(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && value.trim() !== "" && !(key in out)) out[key] = value.trim();
  }
  return out;
}

/** Every value of a repeated field (checkbox groups). */
export const formList = (form: FormData, name: string) =>
  form.getAll(name).filter((value): value is string => typeof value === "string" && value !== "");

/** A comma- or line-separated list typed into one box. */
export const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Runs a form's action with pending and error state. Field messages from the schema or the API
 * end up in `errors`; anything else in `message`.
 */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setErrors({});
    setMessage(null);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      if (error instanceof InvalidForm) {
        setErrors(error.fields);
      } else if (error instanceof FormError) {
        setMessage(error.message);
      } else if (error instanceof ApiProblem) {
        setProblem(error);
        const fields: FieldErrors = {};
        for (const item of error.errors) fields[item.path] ??= item.message;
        setErrors(fields);
        setMessage(error.errors.length ? "Check the highlighted fields." : error.message);
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  /**
   * For `<form onSubmit>`: the form's data is handed to `action`. With `reset`, the form is
   * cleared once it succeeds (forms that add an item to a list).
   */
  const submit =
    (action: (form: FormData) => Promise<void>, options: { reset?: boolean } = {}) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const element = event.currentTarget;
      const data = new FormData(element);
      void run(async () => {
        await action(data);
        if (options.reset) element.reset();
      });
    };

  return { pending, errors, message, problem, run, submit };
}

export function FormMessage({
  message,
  children,
}: {
  message: string | null;
  children?: ReactNode;
}) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>
        {message}
        {children}
      </AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
}

function FieldShell({
  id,
  label,
  error,
  hint,
  className,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  error,
  hint,
  className,
  ...props
}: FieldProps & ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  ...props
}: FieldProps & ComponentProps<typeof Textarea>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <Textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

/** shadcn's input look on a native <select>, which forms read without any help. */
export const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  label,
  error,
  hint,
  className,
  options,
  placeholder,
  ...props
}: FieldProps & ComponentProps<"select"> & { options: readonly Option[]; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className}>
      <select id={id} className={selectClass} aria-invalid={error ? true : undefined} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
  value = "on",
}: {
  label: ReactNode;
  name: string;
  defaultChecked?: boolean;
  value?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} name={name} value={value} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

/** Several checkboxes under one name: read back with `formList`. */
export function CheckboxGroup({
  label,
  name,
  options,
  defaultValues = [],
  error,
  columns = 2,
}: {
  label: string;
  name: string;
  options: readonly Option[];
  defaultValues?: readonly string[];
  error?: string | undefined;
  columns?: 2 | 3 | 4;
}) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[columns];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 font-medium text-sm">{label}</legend>
      <div className={cn("grid gap-2", grid)}>
        {options.map((option) => (
          <CheckboxField
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            defaultChecked={defaultValues.includes(option.value)}
          />
        ))}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </fieldset>
  );
}
