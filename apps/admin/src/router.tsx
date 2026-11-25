import { Toaster } from "@salonstaff/ui/components/sonner";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ConfirmChoiceDialog } from "./components/confirm-choice";
import { Shell } from "./components/shell";
import { AuditLogPage } from "./routes/audit";
import { ChecksPage } from "./routes/checks";
import { ClaimsPage } from "./routes/claims";
import { DirectoryPage } from "./routes/directory";
import { JobsPage, validateJobsSearch } from "./routes/jobs";
import { OverviewPage } from "./routes/overview";
import { PasskeysPage } from "./routes/passkeys";
import { PaymentsPage } from "./routes/payments";
import { SalonPage } from "./routes/salon";
import { SalonsPage, validateSalonsSearch } from "./routes/salons";
import { StaffPage } from "./routes/staff";
import { UserPage } from "./routes/user";
import { UsersPage, validateUsersSearch } from "./routes/users";

// The shell is the root: it shows the portal to staff, and says why to anyone the gate turns away.
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Shell />
      <ConfirmChoiceDialog />
      <Toaster richColors />
    </>
  ),
});

const page = <P extends string>(path: P) => ({ getParentRoute: () => rootRoute, path });

const overviewRoute = createRoute({ ...page("/"), component: OverviewPage });
const checksRoute = createRoute({
  ...page("/checks"),
  validateSearch: (search): { show?: "all" } => (search.show === "all" ? { show: "all" } : {}),
  component: ChecksPage,
});
const claimsRoute = createRoute({
  ...page("/claims"),
  validateSearch: (search): { show?: "all" } => (search.show === "all" ? { show: "all" } : {}),
  component: ClaimsPage,
});
const usersRoute = createRoute({
  ...page("/users"),
  validateSearch: validateUsersSearch,
  component: UsersPage,
});
const userRoute = createRoute({ ...page("/users/$userId"), component: UserPage });
const salonsRoute = createRoute({
  ...page("/salons"),
  validateSearch: validateSalonsSearch,
  component: SalonsPage,
});
const salonRoute = createRoute({ ...page("/salons/$salonId"), component: SalonPage });
const jobsRoute = createRoute({
  ...page("/jobs"),
  validateSearch: validateJobsSearch,
  component: JobsPage,
});
const paymentsRoute = createRoute({ ...page("/payments"), component: PaymentsPage });
const directoryRoute = createRoute({ ...page("/directory"), component: DirectoryPage });
const auditLogRoute = createRoute({
  ...page("/audit-log"),
  validateSearch: (search): { target?: string } =>
    typeof search.target === "string" && search.target ? { target: search.target } : {},
  component: AuditLogPage,
});
const staffRoute = createRoute({ ...page("/staff"), component: StaffPage });
const passkeysRoute = createRoute({ ...page("/passkeys"), component: PasskeysPage });

const routeTree = rootRoute.addChildren([
  overviewRoute,
  checksRoute,
  claimsRoute,
  usersRoute,
  userRoute,
  salonsRoute,
  salonRoute,
  jobsRoute,
  paymentsRoute,
  directoryRoute,
  auditLogRoute,
  staffRoute,
  passkeysRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
