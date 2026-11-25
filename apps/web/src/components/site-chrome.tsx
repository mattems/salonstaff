/** The header and footer on every page. */
import { BRAND } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { authCall, errorMessage } from "@/lib/api";
import { forgetMe, type Me } from "@/lib/session";

export function useSignOut() {
  const router = useRouter();
  const navigate = useNavigate();
  return async () => {
    try {
      await authCall("sign-out", {});
    } catch (error) {
      toast.error(errorMessage(error));
      return;
    }
    forgetMe();
    await navigate({ to: "/" });
    await router.invalidate();
  };
}

export function SiteHeader({ me }: { me: Me | null }) {
  const signOut = useSignOut();
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="font-semibold">
          {BRAND.name}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link to="/jobs">Find jobs</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/salons">Salons</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/for-salons">For salons</Link>
          </Button>
        </nav>
        <div className="ml-auto flex items-center gap-1 text-sm">
          {me ? (
            <>
              {me.role === "employer" ? (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/employer">Dashboard</Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/employer/account">Account</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                    <Link to="/account/applications">Applications</Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/account">Profile</Link>
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/sign-in" search={{ as: "employer", next: "/employer" }}>
                  Post a job
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 py-8 text-muted-foreground text-sm sm:px-6">
        <p>
          © {new Date().getFullYear()} {BRAND.name}
        </p>
        <nav className="flex flex-wrap gap-4">
          <Link to="/jobs" className="hover:underline">
            Jobs
          </Link>
          <Link to="/salons" className="hover:underline">
            Salons
          </Link>
          <Link to="/for-salons" className="hover:underline">
            For salons
          </Link>
          <Link to="/privacy" className="hover:underline">
            Privacy
          </Link>
          <a href={`mailto:${BRAND.supportEmail}`} className="hover:underline">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
