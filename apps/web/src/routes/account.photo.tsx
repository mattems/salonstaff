import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { NeedsProfile, SectionCard, useMyProfile, useRefresh } from "@/components/account-profile";
import { FormError, FormMessage, SubmitButton, useAction } from "@/components/form";
import { api, multipart, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/photo")({
  head: () => privatePage("Your photo"),
  component: Photo,
});

function Photo() {
  const full = useMyProfile();
  const refresh = useRefresh();
  const action = useAction();
  if (!full) return <NeedsProfile />;
  const { photoUrl, firstName } = full.profile;
  return (
    <SectionCard
      title="Photo"
      description="A clear, friendly photo of you. It's also the picture when you share your profile. JPG, PNG, WebP or HEIC, up to 8MB."
    >
      <div className="flex flex-wrap items-start gap-6">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={firstName}
            className="size-32 rounded-full border object-cover"
          />
        ) : (
          <div className="flex size-32 items-center justify-center rounded-full border text-muted-foreground text-xs">
            No photo
          </div>
        )}
        <form
          className="grid min-w-60 flex-1 gap-2"
          onSubmit={action.submit(async (form) => {
            const file = form.get("file");
            if (!(file instanceof File) || file.size === 0)
              throw new FormError("Choose a photo first");
            unwrap(await api.POST("/v1/me/photo", multipart(form)));
            await refresh("Photo saved");
          })}
        >
          <Input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            aria-label="Photo"
          />
          <FormMessage message={action.message} />
          <div className="flex gap-2">
            <SubmitButton pending={action.pending} size="sm">
              Upload
            </SubmitButton>
            {photoUrl && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={action.pending}
                onClick={() =>
                  action.run(async () => {
                    unwrap(await api.DELETE("/v1/me/photo"));
                    await refresh("Photo removed");
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </div>
    </SectionCard>
  );
}
