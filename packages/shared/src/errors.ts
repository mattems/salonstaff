/**
 * API errors follow RFC 9457 (`application/problem+json`) with a stable,
 * machine-readable `code` and a `hint` that says how to fix the problem.
 */
export const ERROR_CODES = {
  validation_failed: { status: 400, title: "The request is not valid" },
  link_expired: { status: 400, title: "That link can't be used" },
  unauthenticated: { status: 401, title: "You are not signed in" },
  forbidden: { status: 403, title: "You are not allowed to do this" },
  confirmation_required: { status: 403, title: "This needs confirming with your passkey" },
  sign_in_again: { status: 403, title: "Sign in again first" },
  account_deleted: { status: 403, title: "This account is scheduled for deletion" },
  email_not_confirmed: { status: 403, title: "This email address has not been confirmed" },
  account_suspended: { status: 403, title: "This account has been suspended" },
  salon_suspended: { status: 403, title: "This salon has been suspended" },
  not_verified: { status: 403, title: "Verify your identity first" },
  cannot_apply: { status: 403, title: "You can't apply for this job" },
  listing_needed: { status: 402, title: "A listing credit or the Salon Plan is needed to publish" },
  not_found: { status: 404, title: "Not found" },
  billing_off: { status: 404, title: "Billing isn't switched on here" },
  not_configured: { status: 503, title: "This isn't set up here yet" },
  method_not_allowed: { status: 405, title: "Method not allowed" },
  conflict: { status: 409, title: "This conflicts with the current state" },
  in_use: { status: 409, title: "This is still in use" },
  idempotency_in_progress: {
    status: 409,
    title: "A request with this idempotency key is still in progress",
  },
  image_too_large: { status: 413, title: "That image is too large" },
  image_not_supported: { status: 415, title: "That file can't be used as a picture" },
  file_too_large: { status: 413, title: "That file is too large" },
  file_not_supported: { status: 415, title: "That kind of file can't be uploaded" },
  idempotency_not_replayable: {
    status: 409,
    title: "This request already succeeded, and its answer can't be shown again",
  },
  idempotency_key_reused: { status: 422, title: "Idempotency key reused with a different request" },
  rate_limited: { status: 429, title: "Too many requests" },
  internal_error: { status: 500, title: "Something went wrong on our side" },
  upstream_unavailable: { status: 502, title: "A service we rely on didn't answer" },
  billing_unavailable: { status: 502, title: "Stripe didn't answer" },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface FieldError {
  /** Path to the field, e.g. `members.0.email`. */
  path: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  hint?: string;
  docs_url?: string;
  request_id?: string;
  errors?: FieldError[];
}

export interface ApiErrorOptions {
  detail?: string;
  hint?: string;
  errors?: FieldError[];
  cause?: unknown;
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly hint: string | undefined;
  readonly errors: FieldError[] | undefined;

  constructor(code: ErrorCode, options: ApiErrorOptions = {}) {
    super(options.detail ?? ERROR_CODES[code].title, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.hint = options.hint;
    this.errors = options.errors;
  }

  /**
   * The error as the API returns it. There are no per-error documentation
   * pages yet, so `type` is RFC 9457's "no further meaning" value and no
   * `docs_url` is sent, unless a docs address is given. `code` is what callers
   * should rely on.
   */
  toProblem(context: { docsBaseUrl?: string | undefined; requestId?: string } = {}): Problem {
    const docs = context.docsBaseUrl ? `${context.docsBaseUrl}/errors/${this.code}` : undefined;
    const problem: Problem = {
      type: docs ?? "about:blank",
      title: ERROR_CODES[this.code].title,
      status: this.status,
      code: this.code,
    };
    if (docs) problem.docs_url = docs;
    if (this.message !== problem.title) problem.detail = this.message;
    if (this.hint) problem.hint = this.hint;
    if (this.errors?.length) problem.errors = this.errors;
    if (context.requestId) problem.request_id = context.requestId;
    return problem;
  }
}
