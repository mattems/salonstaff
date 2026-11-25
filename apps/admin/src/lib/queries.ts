import type { StaffPermission } from "@salonstaff/shared";
import { keepPreviousData, QueryClient, queryOptions } from "@tanstack/react-query";
import { ApiProblem, api, unwrap } from "./api";
import type { components } from "./api/schema";

type Schemas = components["schemas"];
export type StaffMe = Schemas["AdminMe"];
export type StaffMember = Schemas["AdminStaffMember"];
export type Passkey = Schemas["AdminPasskey"];
export type AuditEvent = Schemas["AdminAuditEvent"];
export type Overview = Schemas["AdminOverview"];
export type Queues = Schemas["AdminQueues"];
export type User = Schemas["AdminUser"];
export type UserDetail = Schemas["AdminUserDetail"];
export type Flag = Schemas["AdminFlag"];
export type Salon = Schemas["AdminSalon"];
export type SalonDetail = Schemas["AdminSalonDetail"];
export type Job = Schemas["AdminJob"];
export type Payment = Schemas["AdminPayment"];
export type Check = Schemas["AdminCheck"];
export type Claim = Schemas["AdminClaim"];
export type ImportReport = Schemas["AdminImportReport"];
export type ListingInput = Schemas["AdminListingInput"];
export type ActorType = AuditEvent["actor_type"];

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Lacking access won't fix itself by asking again.
      retry: (count, error) => !(error instanceof ApiProblem && error.status < 500) && count < 2,
    },
  },
});

/** Everything that might show a changed person, salon, job or queue: refreshed after any change. */
export const refreshAll = () => queryClient.invalidateQueries();

/** The staff member Cloudflare Access let in. Fails with the API's reason when the gate turns them away. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<StaffMe> => unwrap(await api.GET("/admin/v1/me")),
});

export function can(me: StaffMe | undefined, permission: StaffPermission): boolean {
  return me?.permissions.includes(permission) ?? false;
}

export const overviewQuery = queryOptions({
  queryKey: ["overview"],
  queryFn: async (): Promise<Overview> => unwrap(await api.GET("/admin/v1/overview")),
});

/** The counts beside the menu. */
export const queuesQuery = queryOptions({
  queryKey: ["queues"],
  refetchInterval: 60_000,
  queryFn: async (): Promise<Queues> => unwrap(await api.GET("/admin/v1/queues")),
});

const PAGE = 50;
/** Drops filters that are empty, so they stay out of the query string. */
const present = <T extends object>(filters: T) =>
  Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;

export interface UserFilters {
  q?: string | undefined;
  role?: "seeker" | "employer" | undefined;
  banned?: "true" | undefined;
  flagged?: "true" | undefined;
}

export const usersQuery = (filters: UserFilters, cursor: string | undefined) =>
  queryOptions({
    queryKey: ["users", filters, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/users", {
          params: { query: { limit: PAGE, ...present(filters), ...(cursor ? { cursor } : {}) } },
        }),
      ),
  });

export const userQuery = (id: string) =>
  queryOptions({
    queryKey: ["user", id],
    queryFn: async (): Promise<UserDetail> =>
      unwrap(await api.GET("/admin/v1/users/{id}", { params: { path: { id } } })),
  });

export interface SalonFilters {
  q?: string | undefined;
  abn_status?: "not_started" | "pending" | "requires_input" | "verified" | "failed" | undefined;
  claimed?: "claimed" | "unclaimed" | undefined;
  status?: "active" | "suspended" | "removed" | undefined;
}

export const salonsQuery = (filters: SalonFilters, cursor: string | undefined) =>
  queryOptions({
    queryKey: ["salons", filters, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/salons", {
          params: { query: { limit: PAGE, ...present(filters), ...(cursor ? { cursor } : {}) } },
        }),
      ),
  });

export const salonQuery = (id: string) =>
  queryOptions({
    queryKey: ["salon", id],
    queryFn: async (): Promise<SalonDetail> =>
      unwrap(await api.GET("/admin/v1/salons/{id}", { params: { path: { id } } })),
  });

export interface JobFilters {
  q?: string | undefined;
  status?: "live" | "expired" | "draft" | "closed" | "featured" | undefined;
}

export const jobsQuery = (filters: JobFilters, cursor: string | undefined) =>
  queryOptions({
    queryKey: ["jobs", filters, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/jobs", {
          params: { query: { limit: PAGE, ...present(filters), ...(cursor ? { cursor } : {}) } },
        }),
      ),
  });

export const paymentsQuery = (cursor: string | undefined) =>
  queryOptions({
    queryKey: ["payments", cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/payments", {
          params: { query: { limit: PAGE, ...(cursor ? { cursor } : {}) } },
        }),
      ),
  });

export const checksQuery = (status: "pending" | "all", cursor: string | undefined) =>
  queryOptions({
    queryKey: ["checks", status, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/checks", {
          params: { query: { limit: PAGE, status, ...(cursor ? { cursor } : {}) } },
        }),
      ),
  });

export const claimsQuery = (status: "open" | "all", cursor: string | undefined) =>
  queryOptions({
    queryKey: ["claims", status, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/claims", {
          params: { query: { limit: PAGE, status, ...(cursor ? { cursor } : {}) } },
        }),
      ),
  });

export interface AuditFilters {
  q: string;
  actorType: ActorType | "all";
  days: number;
}

export const auditQuery = (filters: AuditFilters, cursor: string | undefined, target?: string) =>
  queryOptions({
    queryKey: ["audit", target ?? null, filters, cursor ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.GET("/admin/v1/audit-log", {
          params: {
            query: {
              limit: 50,
              days: filters.days,
              ...(target ? { target } : {}),
              ...(filters.q ? { q: filters.q } : {}),
              ...(filters.actorType === "all" ? {} : { actor_type: filters.actorType }),
              ...(cursor ? { cursor } : {}),
            },
          },
        }),
      ),
  });

export const staffQuery = queryOptions({
  queryKey: ["staff"],
  queryFn: async (): Promise<StaffMember[]> => unwrap(await api.GET("/admin/v1/staff")).data,
});

/** Your own passkeys. */
export const passkeysQuery = queryOptions({
  queryKey: ["passkeys"],
  queryFn: async (): Promise<Passkey[]> => unwrap(await api.GET("/admin/v1/passkeys")).data,
});

/** Local development only: the staff you can choose to be. Fails (404) anywhere deployed. */
export const localStaffQuery = queryOptions({
  queryKey: ["local-staff"],
  retry: false,
  queryFn: async () => unwrap(await api.GET("/admin/v1/local-staff")).data,
});
