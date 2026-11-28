/**
 * Choosing a salon's logo and top picture (D-22), shown as its page will look. Each picture is
 * saved as soon as it's chosen; owners only (the API refuses managers).
 */
import { Button } from "@salonstaff/ui/components/button";
import { Spinner } from "@salonstaff/ui/components/spinner";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, multipart, type Schemas, unwrap } from "@/lib/api";
import { SalonBanner, SalonLogo } from "./salon-brand";

type Salon = Schemas["MySalon"];
type Kind = "logo" | "hero";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic";

export function SalonPictures({
  salon,
  onChange,
}: {
  salon: Salon;
  /** With the salon as saved, after each change. */
  onChange?: (salon: Salon) => void;
}) {
  const [current, setCurrent] = useState(salon);
  const [busy, setBusy] = useState<Kind | null>(null);
  const inputs = { logo: useRef<HTMLInputElement>(null), hero: useRef<HTMLInputElement>(null) };

  async function save(kind: Kind, file: File | null) {
    setBusy(kind);
    try {
      const params = { params: { path: { salonId: current.id } } };
      let updated: Salon;
      if (file) {
        const form = new FormData();
        form.set("file", file);
        updated = unwrap(
          kind === "logo"
            ? await api.POST("/v1/employer/salons/{salonId}/logo", {
                ...params,
                ...multipart(form),
              })
            : await api.POST("/v1/employer/salons/{salonId}/hero", {
                ...params,
                ...multipart(form),
              }),
        );
      } else {
        updated = unwrap(
          kind === "logo"
            ? await api.DELETE("/v1/employer/salons/{salonId}/logo", params)
            : await api.DELETE("/v1/employer/salons/{salonId}/hero", params),
        );
      }
      setCurrent(updated);
      onChange?.(updated);
      toast.success(
        file
          ? kind === "logo"
            ? "Logo saved"
            : "Cover photo saved"
          : kind === "logo"
            ? "Logo removed"
            : "Cover photo removed",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const pick = (kind: Kind) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void save(kind, file);
  };

  const controls = (kind: Kind, has: boolean) => (
    <div className="flex flex-wrap gap-2">
      <input
        ref={inputs[kind]}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={kind === "logo" ? "Logo" : "Cover photo"}
        onChange={pick(kind)}
      />
      <Button
        type="button"
        size="sm"
        variant={has ? "outline" : "default"}
        disabled={busy !== null}
        onClick={() => inputs[kind].current?.click()}
      >
        {busy === kind ? <Spinner /> : <UploadIcon />}
        {has ? "Change" : kind === "logo" ? "Add a logo" : "Add a cover photo"}
      </Button>
      {has && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void save(kind, null)}
        >
          <Trash2Icon />
          Remove
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <SalonBanner heroUrl={current.heroUrl}>
          {!current.heroUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground text-sm">
              <ImageIcon className="size-6" />
              Your cover photo goes here
            </div>
          )}
          {busy === "hero" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Spinner />
            </div>
          )}
        </SalonBanner>
        <div className="flex items-end gap-4 px-4 sm:px-6">
          <SalonLogo
            name={current.name}
            logoUrl={current.logoUrl}
            size="lg"
            className="relative z-10 -mt-12 border-4 border-background shadow-sm sm:-mt-14"
          />
          <div className="min-w-0 pb-1">
            <p className="truncate font-semibold text-xl tracking-tight">{current.name}</p>
            <p className="text-muted-foreground text-sm">
              {current.suburb} {current.state}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="font-medium text-sm">Cover photo</p>
          <p className="text-muted-foreground text-sm">
            A wide photo of the salon: the space, the team or your work. At least 1600 × 600 looks
            sharpest; it's cropped to fit.
          </p>
          {controls("hero", Boolean(current.heroUrl))}
        </div>
        <div className="space-y-2">
          <p className="font-medium text-sm">Logo</p>
          <p className="text-muted-foreground text-sm">
            Shown on your page, your jobs and in the directory. Square works best, at least 400 ×
            400.
          </p>
          {controls("logo", Boolean(current.logoUrl))}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">JPG, PNG, WebP or HEIC, up to 8MB each.</p>
    </div>
  );
}
