/**
 * The typed API client, from the API's OpenAPI description (`bun run api:types` at the repo root
 * writes `./api/schema.d.ts`). The app signs in with Better Auth (`/v1/auth/*`, not in the
 * description) and sends the session token as `Authorization: Bearer`.
 */
import type { LiveSocket } from '@salonstaff/shared';
import createClient from 'openapi-fetch';

import { API_URL } from '@/lib/config';

import type { components, paths } from './api/schema';

// ---------- The API's shapes ----------

export type Schemas = components['schemas'];
export type Me = Schemas['Me'];
export type NotificationPreferences = Schemas['NotificationPreferences'];
export type MyConversation = Schemas['MyConversation'];
export type ConversationThread = Schemas['MyConversationThread'];
export type ApplicationDetail = Schemas['MyApplicationDetail'];
export type Message = Schemas['Message'];
export type SeekerProfile = Schemas['SeekerProfile'];
export type Verification = Schemas['Verification'];
export type VerificationStatus = Verification['identity'];
export type JobSummary = Schemas['JobSummary'];
export type JobDetail = Schemas['JobDetail'];
export type JobViewer = Schemas['JobViewer'];
export type JobAd = Schemas['JobAd'];
export type MyApplication = Schemas['MyApplication'];
export type MyProfile = Schemas['MyProfile'];
export type Education = Schemas['Education'];
export type Experience = Schemas['Experience'];
export type PortfolioItem = Schemas['PortfolioItem'];
export type Checks = Schemas['Checks'];
export type JobFilters = NonNullable<paths['/v1/jobs']['get']['parameters']['query']>;
export type ProfileInput = NonNullable<
  paths['/v1/me/profile']['put']['requestBody']
>['content']['application/json'];
export type EducationInput = NonNullable<
  paths['/v1/me/education']['post']['requestBody']
>['content']['application/json'];
export type RightToWorkInput = NonNullable<
  paths['/v1/me/checks/right-to-work']['post']['requestBody']
>['content']['application/json'];
export type DetailsInput = NonNullable<
  paths['/v1/me/profile/details']['put']['requestBody']
>['content']['application/json'];
export type ExperienceInput = NonNullable<
  paths['/v1/me/experience']['post']['requestBody']
>['content']['application/json'];
export type EndorsementRequest = NonNullable<
  paths['/v1/me/endorsements']['post']['requestBody']
>['content']['application/json'];
export type SettingsInput = NonNullable<
  paths['/v1/me/profile/settings']['patch']['requestBody']
>['content']['application/json'];
export type ProfileSettings = Schemas['ProfileSettings'];
export type MyEndorsement = Schemas['MyEndorsement'];
export type HiddenSalon = Schemas['HiddenSalon'];
export type SignInSession = Schemas['SignInSession'];
export type SalonJob = Schemas['SalonJob'];
export type SalonApplicant = Schemas['SalonApplicant'];
export type SalonConversation = Schemas['SalonConversationSummary'];
export type CandidateConversation = Schemas['CandidateConversation'];
export type Candidate = Schemas['Candidate'];
export type ApplicationStatus = SalonApplicant['status'];
export type SalonApplicantsQuery = NonNullable<
  paths['/v1/employer/applicants']['get']['parameters']['query']
>;
export type SignInMethods = Schemas['SignInMethods'];
/** A picked file, ready for a multipart upload. */
export type UploadFile = { blob: Blob; name: string };

// ---------- Errors ----------

/** An error answer from the API (RFC 9457 with `code` and `hint`), or from Better Auth. */
export class ApiProblem extends Error {
  /** HTTP status, or 0 when the server couldn't be reached. */
  readonly status: number;
  readonly code: string;
  readonly hint: string | undefined;
  readonly errors: { path: string; message: string }[];

  constructor(status: number, body: unknown) {
    const problem = (body ?? {}) as {
      title?: string;
      detail?: string;
      message?: string;
      code?: string;
      hint?: string;
      errors?: { path: string; message: string }[];
    };
    super(
      problem.detail ??
        problem.message ??
        problem.title ??
        (status >= 500 ? 'Server error. Please try again shortly.' : `Request failed (${status})`),
    );
    this.name = 'ApiProblem';
    this.status = status;
    this.code = problem.code ?? 'unknown';
    this.hint = problem.hint;
    this.errors = problem.errors ?? [];
  }

  /** The message for one form field, if the API named it. */
  field(path: string): string | undefined {
    return this.errors.find((error) => error.path === path)?.message;
  }
}

const UNREACHABLE = "Can't reach Salon Staff right now. Check your connection and try again.";

/** A sentence to show a person when something fails. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof ApiProblem) return err.errors[0]?.message ?? err.message ?? fallback;
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

function headersFor(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A live conversation's socket (D-18) at `path` on the API, signed in with the session's token. */
export function liveSocket(path: string): LiveSocket {
  const url = `${API_URL.replace(/^http/, 'ws')}${path}`;
  // React Native's WebSocket takes headers as a third argument; the DOM types don't know it.
  const NativeSocket = WebSocket as unknown as new (
    url: string,
    protocols: null,
    options: { headers: Record<string, string> },
  ) => LiveSocket;
  return new NativeSocket(url, null, { headers: headersFor(authToken) });
}

/**
 * Every call goes through here. Cookies are never sent (`credentials: 'omit'`): the bearer token is
 * the only session, so signing out really signs out. A 401 on a signed-in call ends the session.
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: 'omit' });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new ApiProblem(0, { detail: UNREACHABLE });
  }
  const hadToken = new Headers(init.headers).has('Authorization');
  if (response.status === 401 && hadToken) unauthorizedHandler?.();
  return response;
}

const client = createClient<paths>({
  baseUrl: API_URL,
  // React Native's fetch is happier with a URL and init than with a Request object.
  fetch: async (request: Request) =>
    send(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
      signal: request.signal,
    }),
});

client.use({
  onRequest({ request }) {
    if (authToken && !request.headers.has('Authorization')) {
      request.headers.set('Authorization', `Bearer ${authToken}`);
    }
    request.headers.set('Accept', 'application/json');
    return request;
  },
});

/** The data from a typed call, or an `ApiProblem` thrown. */
function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (!result.response.ok) throw new ApiProblem(result.response.status, result.error);
  return result.data as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A multipart upload (photos, certificates): sent directly, so the File blob isn't re-read. */
async function upload<T>(method: 'POST', path: string, form: FormData): Promise<T> {
  const response = await send(`${API_URL}${path}`, {
    method,
    headers: { Accept: 'application/json', ...headersFor(authToken) },
    body: form,
  });
  const data = await readJson(response);
  if (!response.ok) throw new ApiProblem(response.status, data);
  return data as T;
}

// ---------- Sign-in (Better Auth, /v1/auth/*) ----------

/** Where a one-time sign-in code is sent. `phone` is E.164 (+614…). */
export type CodeTarget = { email: string } | { phone: string };

export type OAuthProvider = 'google' | 'apple';

async function authCall(path: string, body: unknown, token?: string | null): Promise<Response> {
  const response = await send(`${API_URL}/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headersFor(token) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ApiProblem(response.status, await readJson(response));
  return response;
}

/** The session token from a sign-in: Better Auth's bearer plugin puts it in `set-auth-token`. */
async function sessionToken(response: Response): Promise<string> {
  const fromHeader = response.headers.get('set-auth-token');
  const body = (await readJson(response)) as { token?: string } | undefined;
  const token = fromHeader || body?.token;
  if (!token) throw new ApiProblem(500, { detail: 'Signed in, but no session came back.' });
  return token;
}

// ---------- Endpoints ----------

const path = (value: string) => ({ path: { id: value } });

export const api = {
  // Sign-in
  sendCode: async (target: CodeTarget) => {
    if ('email' in target)
      await authCall('email-otp/send-verification-otp', { email: target.email, type: 'sign-in' });
    else await authCall('phone-number/send-otp', { phoneNumber: target.phone });
  },
  /** Returns the session token. Signs up on first use (as a job seeker). */
  verifyCode: async (target: CodeTarget, code: string) =>
    sessionToken(
      'email' in target
        ? await authCall('sign-in/email-otp', { email: target.email, otp: code })
        : await authCall('phone-number/verify', { phoneNumber: target.phone, code }),
    ),
  /** Native Google / Apple: the provider's ID token. Apple sends the name on the first sign-in only. */
  signInWithIdToken: async (provider: OAuthProvider, idToken: string, name?: string) => {
    const [firstName, ...rest] = (name ?? '').trim().split(/\s+/);
    const user = firstName ? { name: { firstName, lastName: rest.join(' ') } } : undefined;
    return sessionToken(
      await authCall('sign-in/social', { provider, idToken: { token: idToken, user } }),
    );
  },
  /** Local development only (404 anywhere else): the demo job seeker, without a code. */
  devLogin: async (role: 'seeker' | 'employer' = 'seeker') => {
    const response = await authCall('dev-login', { role });
    return sessionToken(response);
  },
  signOut: async () => {
    await authCall('sign-out', {}, authToken);
  },

  // Me
  me: async (token?: string) =>
    unwrap(await client.GET('/v1/me', token ? { headers: headersFor(token) } : {})),
  deleteAccount: async () => unwrap(await client.DELETE('/v1/me')),
  myApplications: async () => unwrap(await client.GET('/v1/me/applications')),
  // Conversations with salons (D-19): one per salon, about applications or from their profile
  conversations: async () => unwrap(await client.GET('/v1/me/conversations')),
  conversation: async (id: string) =>
    unwrap(await client.GET('/v1/me/conversations/{id}', { params: path(id) })),
  sendMessage: async (conversationId: string, body: string, applicationId?: string) =>
    unwrap(
      await client.POST('/v1/me/conversations/{id}/messages', {
        params: path(conversationId),
        body: applicationId ? { body, applicationId } : { body },
      }),
    ),
  application: async (id: string) =>
    unwrap(await client.GET('/v1/me/applications/{id}', { params: path(id) })),
  mySaved: async () => unwrap(await client.GET('/v1/me/saved')),

  // Profile
  profile: async () => unwrap(await client.GET('/v1/me/profile')),
  saveProfile: async (body: ProfileInput) => unwrap(await client.PUT('/v1/me/profile', { body })),
  /** Skills, availability and pay are saved together: send the others' current values. */
  saveDetails: async (body: DetailsInput) =>
    unwrap(await client.PUT('/v1/me/profile/details', { body })),
  uploadPhoto: (file: UploadFile) => {
    const form = new FormData();
    form.append('file', file.blob, file.name);
    return upload<Schemas['ProfilePhoto']>('POST', '/v1/me/photo', form);
  },
  removePhoto: async () => unwrap(await client.DELETE('/v1/me/photo')),
  addPortfolioPhoto: (file: UploadFile, caption?: string) => {
    const form = new FormData();
    form.append('file', file.blob, file.name);
    if (caption?.trim()) form.append('caption', caption.trim());
    return upload<PortfolioItem>('POST', '/v1/me/portfolio', form);
  },
  removePortfolioPhoto: async (id: string) =>
    unwrap(await client.DELETE('/v1/me/portfolio/{id}', { params: path(id) })),
  addExperience: async (body: ExperienceInput) =>
    unwrap(await client.POST('/v1/me/experience', { body })),
  removeExperience: async (id: string) =>
    unwrap(await client.DELETE('/v1/me/experience/{id}', { params: path(id) })),
  addEducation: async (body: EducationInput) =>
    unwrap(await client.POST('/v1/me/education', { body })),
  removeEducation: async (id: string) =>
    unwrap(await client.DELETE('/v1/me/education/{id}', { params: path(id) })),

  // Endorsements
  endorsements: async () => unwrap(await client.GET('/v1/me/endorsements')),
  askForEndorsement: async (body: EndorsementRequest) =>
    unwrap(await client.POST('/v1/me/endorsements', { body })),
  showEndorsement: async (id: string, shown: boolean) =>
    unwrap(await client.PATCH('/v1/me/endorsements/{id}', { params: path(id), body: { shown } })),
  removeEndorsement: async (id: string) =>
    unwrap(await client.DELETE('/v1/me/endorsements/{id}', { params: path(id) })),

  // Who sees it
  saveSettings: async (body: SettingsInput) =>
    unwrap(await client.PATCH('/v1/me/profile/settings', { body })),
  newShareCode: async () => unwrap(await client.POST('/v1/me/profile/share-code')),
  hiddenSalons: async () => unwrap(await client.GET('/v1/me/hidden-salons')),
  hideFromSalon: async (salonId: string) =>
    unwrap(await client.PUT('/v1/me/hidden-salons/{salonId}', { params: { path: { salonId } } })),
  unhideFromSalon: async (salonId: string) =>
    unwrap(
      await client.DELETE('/v1/me/hidden-salons/{salonId}', { params: { path: { salonId } } }),
    ),
  searchSalons: async (q: string) =>
    unwrap(await client.GET('/v1/salons', { params: { query: { q } } })),

  // Sign-in and security
  changeEmail: async (email: string) =>
    unwrap(await client.POST('/v1/me/email', { body: { email } })),
  confirmEmail: async (email: string, code: string) =>
    unwrap(await client.POST('/v1/me/email/confirm', { body: { email, code } })),
  changeMobile: async (phoneNumber: string) =>
    unwrap(await client.POST('/v1/me/mobile', { body: { phoneNumber } })),
  confirmMobile: async (phoneNumber: string, code: string) =>
    unwrap(await client.POST('/v1/me/mobile/confirm', { body: { phoneNumber, code } })),
  signInMethods: async () => unwrap(await client.GET('/v1/me/sign-in-methods')),
  /** Connect Google or Apple to this account with the provider's ID token (Better Auth). */
  connectProvider: async (provider: OAuthProvider, idToken: string) => {
    await authCall('link-social', { provider, idToken: { token: idToken } }, authToken);
  },
  disconnectProvider: async (provider: OAuthProvider) =>
    unwrap(
      await client.DELETE('/v1/me/sign-in-methods/{provider}', { params: { path: { provider } } }),
    ),
  sessions: async () => unwrap(await client.GET('/v1/me/sessions')),
  signOutSession: async (id: string) =>
    unwrap(await client.DELETE('/v1/me/sessions/{id}', { params: path(id) })),
  signOutOthers: async () => unwrap(await client.DELETE('/v1/me/sessions')),

  // Push notifications (D-15): this phone, for the session it's signed in with
  registerPushDevice: async (body: Schemas['PushDevice']) =>
    unwrap(await client.PUT('/v1/me/push-device', { body })),
  removePushDevice: async () => unwrap(await client.DELETE('/v1/me/push-device')),
  notificationPreferences: async () => unwrap(await client.GET('/v1/me/notifications')),
  saveNotificationPreferences: async (body: NotificationPreferences) =>
    unwrap(await client.PUT('/v1/me/notifications', { body })),

  // Jobs
  jobs: async (query: JobFilters) => unwrap(await client.GET('/v1/jobs', { params: { query } })),
  /**
   * A job ad by its public path (`/jobs/nsw/surry-hills/…`), with what you can do (`viewer`).
   * A renamed ad answers with its new path, which is followed.
   */
  jobAd: async (jobPath: string): Promise<JobAd> => {
    let current = jobPath;
    for (let hop = 0; hop < 3; hop++) {
      const found = unwrap(
        await client.GET('/v1/jobs/by-path', { params: { query: { path: current } } }),
      );
      if (found.kind === 'job') return found;
      if (found.kind !== 'redirect') break;
      current = found.redirect;
    }
    throw new ApiProblem(404, {
      detail: 'This job is no longer on Salon Staff.',
      code: 'not_found',
    });
  },
  apply: async (jobId: string, coverNote?: string) =>
    unwrap(
      await client.POST('/v1/jobs/{id}/apply', { params: path(jobId), body: { coverNote } }),
    ),
  saveJob: async (jobId: string) =>
    unwrap(await client.POST('/v1/jobs/{id}/save', { params: path(jobId) })),
  unsaveJob: async (jobId: string) =>
    unwrap(await client.DELETE('/v1/jobs/{id}/save', { params: path(jobId) })),

  // Verification checks
  checks: async () => unwrap(await client.GET('/v1/me/checks')),
  startIdentity: async (returnUrl: string) =>
    unwrap(await client.POST('/v1/me/checks/identity', { body: { returnUrl } })),
  rightToWork: async (body: RightToWorkInput) =>
    unwrap(await client.POST('/v1/me/checks/right-to-work', { body })),
  /** A certificate for one of your qualifications (an education entry). */
  uploadQualification: (file: { blob: Blob; name: string }, educationId: string) => {
    const form = new FormData();
    form.append('educationId', educationId);
    form.append('file', file.blob, file.name);
    return upload<Checks>('POST', '/v1/me/checks/qualification', form);
  },

  /**
   * The salon side (D-20): jobs, applicants and conversations across every salon you're on, and
   * acting on one through its salon (`salonId` from the item).
   */
  salon: {
    salons: async () => unwrap(await client.GET('/v1/employer/salons')),
    jobs: async (salonId?: string) =>
      unwrap(await client.GET('/v1/employer/jobs', { params: { query: { salonId } } })),
    job: async (salonId: string, id: string) =>
      unwrap(
        await client.GET('/v1/employer/salons/{salonId}/jobs/{id}', {
          params: { path: { salonId, id } },
        }),
      ),
    publish: async (salonId: string, id: string) =>
      unwrap(
        await client.POST('/v1/employer/salons/{salonId}/jobs/{id}/publish', {
          params: { path: { salonId, id } },
        }),
      ),
    close: async (salonId: string, id: string) =>
      unwrap(
        await client.POST('/v1/employer/salons/{salonId}/jobs/{id}/close', {
          params: { path: { salonId, id } },
        }),
      ),
    applicants: async (query: SalonApplicantsQuery) =>
      unwrap(await client.GET('/v1/employer/applicants', { params: { query } })),
    application: async (salonId: string, id: string) =>
      unwrap(
        await client.GET('/v1/employer/salons/{salonId}/applications/{id}', {
          params: { path: { salonId, id } },
        }),
      ),
    setStatus: async (salonId: string, id: string, status: ApplicationStatus) =>
      unwrap(
        await client.PATCH('/v1/employer/salons/{salonId}/applications/{id}', {
          params: { path: { salonId, id } },
          body: { status },
        }),
      ),
    candidate: async (salonId: string, userId: string) =>
      unwrap(
        await client.GET('/v1/employer/salons/{salonId}/candidates/{userId}', {
          params: { path: { salonId, userId } },
        }),
      ),
    showNumber: async (salonId: string, userId: string) =>
      unwrap(
        await client.POST('/v1/employer/salons/{salonId}/candidates/{userId}/phone', {
          params: { path: { salonId, userId } },
        }),
      ),
    conversations: async () => unwrap(await client.GET('/v1/employer/conversations')),
    conversation: async (salonId: string, userId: string) =>
      unwrap(
        await client.GET('/v1/employer/salons/{salonId}/candidates/{userId}/conversation', {
          params: { path: { salonId, userId } },
        }),
      ),
    send: async (salonId: string, userId: string, body: string, applicationId?: string) =>
      unwrap(
        await client.POST('/v1/employer/salons/{salonId}/candidates/{userId}/messages', {
          params: { path: { salonId, userId } },
          body: { body, ...(applicationId ? { applicationId } : {}) },
        }),
      ),
  },
};
