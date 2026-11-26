import { PROFILE_LIMITS } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import {
  type MyProfile,
  NeedsProfile,
  SectionCard,
  useMyProfile,
  useRefresh,
} from "@/components/account-profile";
import { FormError, FormMessage, SubmitButton, useAction } from "@/components/form";
import { api, multipart, unwrap } from "@/lib/api";
import { privatePage } from "@/lib/seo";

type Full = MyProfile;

export const Route = createFileRoute("/account/portfolio")({
  head: () => privatePage("Your portfolio"),
  component: PortfolioPage,
});

function PortfolioPage() {
  const full = useMyProfile();
  return full ? <Portfolio full={full} /> : <NeedsProfile />;
}

function Portfolio({ full }: { full: Full }) {
  const refresh = useRefresh();
  const action = useAction();
  const full_ = full.portfolio.length >= PROFILE_LIMITS.portfolio;
  return (
    <SectionCard
      title="Portfolio"
      description={`Photos of your work, up to ${PROFILE_LIMITS.portfolio}. ${full.portfolio.length} so far.`}
    >
      <div className="space-y-4">
        {full.portfolio.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {full.portfolio.map((item) => (
              <li key={item.id} className="space-y-1">
                <img
                  src={item.imageUrl}
                  alt={item.caption ?? "Portfolio photo"}
                  className="aspect-square w-full rounded-lg border object-cover"
                />
                {item.caption && <p className="text-muted-foreground text-xs">{item.caption}</p>}
                <Button
                  size="xs"
                  variant="outline"
                  disabled={action.pending}
                  onClick={() =>
                    action.run(async () => {
                      unwrap(
                        await api.DELETE("/v1/me/portfolio/{id}", {
                          params: { path: { id: item.id } },
                        }),
                      );
                      await refresh("Photo removed");
                    })
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!full_ && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={action.submit(
              async (form) => {
                const file = form.get("file");
                if (!(file instanceof File) || file.size === 0)
                  throw new FormError("Choose a photo first");
                if (!String(form.get("caption") ?? "").trim()) form.delete("caption");
                unwrap(await api.POST("/v1/me/portfolio", multipart(form)));
                await refresh("Photo added");
              },
              { reset: true },
            )}
          >
            <Input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              aria-label="Portfolio photo"
            />
            <Input
              name="caption"
              maxLength={140}
              placeholder="Caption (optional)"
              aria-label="Caption"
            />
            <SubmitButton pending={action.pending}>Add photo</SubmitButton>
          </form>
        )}
        <FormMessage message={action.message} />
      </div>
    </SectionCard>
  );
}
