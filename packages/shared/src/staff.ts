/**
 * Staff (the people who run Salon Staff) and what each role may do in the admin portal.
 * Staff are not users: Cloudflare Access proves who they are, by email address.
 */
export const STAFF_PERMISSIONS = [
  "users:read",
  "users:flag",
  // Banning (suspending) and lifting a ban, signing someone out everywhere, changing their role.
  "users:ban",
  "users:delete",
  "salons:read",
  // Suspending, removing and reinstating a business; its details, ABN status and owner.
  "salons:moderate",
  "salons:delete",
  // Listing credits, the free period and founding pricing.
  "salons:credits",
  "jobs:moderate",
  "checks:review",
  "claims:review",
  "directory:import",
  "audit:read",
  "staff:manage",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_ROLES = ["owner", "support", "readonly"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const READ: readonly StaffPermission[] = ["users:read", "salons:read", "audit:read"];

export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<StaffPermission>> = {
  owner: new Set(STAFF_PERMISSIONS),
  support: new Set([
    ...READ,
    "users:flag",
    "users:ban",
    "salons:moderate",
    "salons:credits",
    "jobs:moderate",
    "checks:review",
    "claims:review",
    "directory:import",
  ]),
  readonly: new Set(READ),
};

export function staffCan(role: StaffRole, permission: StaffPermission): boolean {
  return STAFF_ROLE_PERMISSIONS[role].has(permission);
}

/** Changes a staff member must confirm with a passkey, per action and target. */
export const STAFF_CONFIRMED_ACTIONS = [
  "passkey.add",
  "passkey.remove",
  "staff.reset_passkeys",
  "staff.add",
  "staff.change_role",
  "staff.remove",
  "user.ban",
  "user.delete",
  "salon.suspend",
  "salon.remove",
  "salon.delete",
  // Who runs a salon: approving a claim, taking its team off, and changing the address claim
  // links are sent to.
  "claim.approve",
  "salon.unclaim",
  "salon.change_email",
] as const;
export type StaffConfirmedAction = (typeof STAFF_CONFIRMED_ACTIONS)[number];

/** How long a passkey challenge stays usable. */
export const STAFF_CONFIRMATION_SECONDS = 120;

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}
