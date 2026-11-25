import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Page } from "@/components/page";
import { requireSignedIn } from "@/lib/session";

/** The salon side (`?as=employer` when signing in): your salons, and each one's pages. */
export const Route = createFileRoute("/employer")({
  beforeLoad: ({ context, location }) => ({
    me: requireSignedIn(context.me, location.href, "employer"),
  }),
  component: EmployerLayout,
});

function EmployerLayout() {
  return (
    <Page width="wide">
      <Outlet />
    </Page>
  );
}
