import type {
  ApiError,
  ApplyInput,
  AuthResponse,
  EducationInput,
  ExperienceInput,
  FullProfile,
  PortfolioItem,
  ProfileDetailsInput,
  JobDetail,
  JobFilters,
  JobSummary,
  Me,
  MyApplication,
  Paginated,
  SeekerProfileInput,
  StartVerificationResponse,
  VerificationSummary,
} from '@salonstaff/shared';

import { API_BASE } from '@/lib/config';

export class ApiClientError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number;
  /** Human-readable message from the server (`ApiError.error`). */
  readonly error: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.name = 'ApiClientError';
    this.status = status;
    this.error = body.error;
    this.fieldErrors = body.fieldErrors;
  }
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof ApiClientError) return err.error || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ---------- Session wiring (set by AuthProvider) ----------

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setApiToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

// ---------- Core request ----------

type Query = Record<string, string | number | undefined | null>;

type RequestOptions = {
  query?: Query;
  json?: unknown;
  form?: FormData;
  /** Override the stored token (used straight after sign-in). */
  token?: string | null;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const token = opts.token !== undefined ? opts.token : authToken;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: string | FormData | undefined;
  if (opts.form) {
    // Let fetch set the multipart boundary.
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new ApiClientError(0, {
      error: "Can't reach Salon Staff right now. Check your connection and try again.",
    });
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.();
    const apiError: ApiError =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? (data as ApiError)
        : { error: res.status >= 500 ? 'Server error. Please try again shortly.' : `Request failed (${res.status})` };
    throw new ApiClientError(res.status, apiError);
  }

  return data as T;
}

// ---------- Endpoints (docs/api.md) ----------

export type RightToWorkInput = import('@salonstaff/shared').RightToWorkInput;

export type UploadFile = {
  /** A Blob-compatible file, e.g. `new File(uri)` from expo-file-system. */
  blob: Blob;
  name: string;
};

/** Where a one-time sign-in code is sent. */
export type CodeTarget = { email: string } | { phone: string };

export type OAuthProvider = 'google' | 'apple';

const id = (value: string) => encodeURIComponent(value);

export const api = {
  // Auth
  requestCode: (target: CodeTarget) =>
    request<{ ok: true }>('POST', '/auth/request-code', {
      json: { ...target, role: 'seeker' },
      token: null,
    }),
  verifyCode: (target: CodeTarget, code: string) =>
    request<AuthResponse>('POST', '/auth/verify-code', {
      json: { ...target, code, client: 'mobile' },
      token: null,
    }),
  oauth: (provider: OAuthProvider, idToken: string, name?: string) =>
    request<AuthResponse>('POST', '/auth/oauth', {
      json: { provider, idToken, name: name || undefined, role: 'seeker' },
      token: null,
    }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),

  // Me
  me: (token?: string) => request<Me>('GET', '/me', token ? { token } : {}),
  updateProfile: (input: SeekerProfileInput) => request<Me>('PUT', '/me/profile', { json: input }),
  deleteAccount: () => request<{ ok: true }>('DELETE', '/me'),
  myApplications: () => request<{ items: MyApplication[] }>('GET', '/me/applications'),
  mySaved: () => request<{ items: JobSummary[] }>('GET', '/me/saved'),

  // Rich profile
  fullProfile: () => request<FullProfile>('GET', '/me/profile/full'),
  updateDetails: (input: ProfileDetailsInput) =>
    request<FullProfile>('PUT', '/me/profile/details', { json: input }),
  uploadPhoto: (file: UploadFile) => {
    const form = new FormData();
    form.append('file', file.blob, file.name);
    return request<{ photoUrl: string }>('POST', '/me/photo', { form });
  },
  deletePhoto: () => request<{ photoUrl: null }>('DELETE', '/me/photo'),
  addPortfolioItem: (file: UploadFile, caption?: string) => {
    const form = new FormData();
    form.append('file', file.blob, file.name);
    if (caption) form.append('caption', caption);
    return request<PortfolioItem>('POST', '/me/portfolio', { form });
  },
  deletePortfolioItem: (itemId: string) =>
    request<{ ok: true }>('DELETE', `/me/portfolio/${id(itemId)}`),
  addExperience: (input: ExperienceInput) =>
    request<FullProfile>('POST', '/me/experience', { json: input }),
  deleteExperience: (itemId: string) =>
    request<FullProfile>('DELETE', `/me/experience/${id(itemId)}`),
  addEducation: (input: EducationInput) =>
    request<FullProfile>('POST', '/me/education', { json: input }),
  deleteEducation: (itemId: string) =>
    request<FullProfile>('DELETE', `/me/education/${id(itemId)}`),

  // Jobs
  jobs: (filters: Partial<JobFilters>, signal?: AbortSignal) =>
    request<Paginated<JobSummary>>('GET', '/jobs', { query: filters, signal }),
  job: (idOrSlug: string) => request<JobDetail>('GET', `/jobs/${encodeURIComponent(idOrSlug)}`),
  apply: (jobId: string, input: ApplyInput) =>
    request<{ ok: true; applicationId: string }>('POST', `/jobs/${encodeURIComponent(jobId)}/apply`, {
      json: input,
    }),
  saveJob: (jobId: string) =>
    request<{ saved: boolean }>('POST', `/jobs/${encodeURIComponent(jobId)}/save`),
  unsaveJob: (jobId: string) =>
    request<{ saved: boolean }>('DELETE', `/jobs/${encodeURIComponent(jobId)}/save`),

  // Verification
  verification: () => request<VerificationSummary>('GET', '/verification'),
  startIdentity: (returnUrl: string) =>
    request<StartVerificationResponse>('POST', '/verification/identity', { json: { returnUrl } }),
  rightToWork: (input: RightToWorkInput) =>
    request<VerificationSummary>('POST', '/verification/right-to-work', { json: input }),
  uploadQualification: (file: UploadFile, title: string) => {
    const form = new FormData();
    form.append('title', title);
    form.append('file', file.blob, file.name);
    return request<VerificationSummary>('POST', '/verification/qualification', { form });
  },
};
