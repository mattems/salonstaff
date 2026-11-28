/**
 * A salon's logo and the wide picture across the top of its page (D-22), drawn the same on its
 * public page, in the directory, while adding a salon and on its details page. Without pictures
 * they fall back to the salon's initials and a plain band in the theme's own colours.
 */
import { cn } from "@salonstaff/ui/lib/utils";

/** "Bella Rosa Hair" → "BR". */
export function initialsOf(name: string): string {
  const words = name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.match(/[a-z0-9]/i)?.[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

const LOGO_SIZES = {
  sm: "size-10 rounded-md text-sm",
  md: "size-14 rounded-lg text-base",
  lg: "size-24 rounded-xl text-2xl sm:size-28 sm:text-3xl",
} as const;

export function SalonLogo({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: keyof typeof LOGO_SIZES;
  className?: string;
}) {
  const box = cn("shrink-0 border bg-background", LOGO_SIZES[size], className);
  if (logoUrl) {
    return <img src={logoUrl} alt={`${name} logo`} className={cn(box, "object-cover")} />;
  }
  return (
    <div
      aria-hidden
      className={cn(
        box,
        "flex items-center justify-center bg-muted font-semibold text-muted-foreground tracking-tight",
      )}
    >
      {initialsOf(name)}
    </div>
  );
}

/** The wide band across the top: the salon's photo, cropped to fit, or a plain one. */
export function SalonBanner({
  heroUrl,
  className,
  children,
}: {
  heroUrl: string | null | undefined;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[5/2] w-full overflow-hidden rounded-xl border bg-muted sm:aspect-[4/1]",
        className,
      )}
    >
      {heroUrl ? (
        <img src={heroUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] bg-[length:18px_18px]"
        />
      )}
      {children}
    </div>
  );
}

/** The top of a salon's page: banner, logo over its edge, and the name beside it. */
export function SalonHeader({
  name,
  logoUrl,
  heroUrl,
  children,
  actions,
}: {
  name: string;
  logoUrl: string | null | undefined;
  heroUrl: string | null | undefined;
  /** Under the name: the place, badges. */
  children?: React.ReactNode;
  /** To the right of the name on wide screens: buttons. */
  actions?: React.ReactNode;
}) {
  return (
    <header>
      <SalonBanner heroUrl={heroUrl} />
      <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-end sm:px-6">
        <SalonLogo
          name={name}
          logoUrl={logoUrl}
          size="lg"
          className="relative z-10 -mt-12 border-4 border-background shadow-sm sm:-mt-14"
        />
        <div className="min-w-0 flex-1 space-y-2 sm:pb-1">
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">{name}</h1>
          {children}
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:pb-1">{actions}</div>}
      </div>
    </header>
  );
}
