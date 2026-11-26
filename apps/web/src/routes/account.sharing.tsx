import { BRAND, PROFILE_VISIBILITY, publicName } from "@salonstaff/shared";
import { Button } from "@salonstaff/ui/components/button";
import { Input } from "@salonstaff/ui/components/input";
import { Label } from "@salonstaff/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@salonstaff/ui/components/radio-group";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type MyProfile,
  NeedsProfile,
  SectionCard,
  useMyProfile,
  useRefresh,
} from "@/components/account-profile";
import { FormMessage, SubmitButton, useAction } from "@/components/form";
import { PostImage } from "@/components/post-image";
import { api, errorMessage, type Schemas, unwrap } from "@/lib/api";
import { roleLabel } from "@/lib/format";
import { absolute, privatePage } from "@/lib/seo";

export const Route = createFileRoute("/account/sharing")({
  loader: async () => unwrap(await api.GET("/v1/me/hidden-salons")),
  head: () => privatePage("Visibility and sharing"),
  component: Sharing,
});

function Sharing() {
  const full = useMyProfile();
  const hidden = Route.useLoaderData();
  if (!full) return <NeedsProfile />;
  return (
    <div className="space-y-6">
      <Visibility settings={full.settings} />
      {full.settings.sharePath && <ShareLink full={full} sharePath={full.settings.sharePath} />}
      <HiddenSalons salons={hidden.items} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Who sees it
// ---------------------------------------------------------------------------

function Visibility({ settings }: { settings: Schemas["ProfileSettings"] }) {
  const refresh = useRefresh();
  const action = useAction();
  return (
    <SectionCard
      title="Who can see your profile"
      description="Salons you apply to always see your profile, whatever you choose here."
    >
      <form
        className="space-y-4"
        onSubmit={action.submit(async (form) => {
          const visibility = String(
            form.get("visibility"),
          ) as Schemas["ProfileSettings"]["visibility"];
          unwrap(await api.PATCH("/v1/me/profile/settings", { body: { visibility } }));
          await refresh(
            visibility === "public" ? "Your profile is public. Share your link!" : "Saved",
          );
        })}
      >
        <RadioGroup name="visibility" defaultValue={settings.visibility} className="gap-3">
          {PROFILE_VISIBILITY.map((option) => (
            <Label
              key={option.value}
              htmlFor={`visibility-${option.value}`}
              className="flex items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary"
            >
              <RadioGroupItem
                id={`visibility-${option.value}`}
                value={option.value}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block font-medium">{option.label}</span>
                <span className="block text-muted-foreground text-sm">{option.description}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <FormMessage message={action.message} />
        <SubmitButton pending={action.pending}>Save</SubmitButton>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// The share link and a post image
// ---------------------------------------------------------------------------

function ShareLink({ full, sharePath }: { full: MyProfile; sharePath: string }) {
  const refresh = useRefresh();
  const [renewing, setRenewing] = useState(false);
  const p = full.profile;
  const url = absolute(sharePath);
  const shown = url.replace(/^https?:\/\//, "");
  const roles = p.roles.map(roleLabel);
  const caption = `I'm looking for my next role${roles[0] ? ` as a ${roles[0].toLowerCase()}` : ""} around ${p.suburb}. See my work and endorsements on ${BRAND.name}: ${shown}`;
  const text = encodeURIComponent(caption);
  const link = encodeURIComponent(url);
  const channels = [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${link}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${text}` },
    { label: "X", href: `https://x.com/intent/post?text=${text}` },
    {
      label: "Email",
      href: `mailto:?subject=${encodeURIComponent(`My ${BRAND.name} profile`)}&body=${text}`,
    },
  ];
  const line = [...roles, `${p.suburb} ${p.state}`].join(" · ");
  const post = useMemo(
    () => ({
      name: publicName(p.firstName, p.lastName),
      headline: p.headline,
      line,
      link: shown,
      photoUrl: p.photoUrl ? "/api/v1/me/photo/image" : null,
    }),
    [p.firstName, p.lastName, p.headline, p.photoUrl, line, shown],
  );

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select it and copy it yourself.");
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `${post.name} on ${BRAND.name}`, text: caption, url });
    } catch {
      // They closed the share sheet.
    }
  }

  async function renew() {
    setRenewing(true);
    try {
      unwrap(await api.POST("/v1/me/profile/share-code"));
      await refresh("New link made. The old one no longer works.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRenewing(false);
    }
  }

  return (
    <>
      <SectionCard
        title="Your share link"
        description="Anyone with this link sees your profile with your first name and last initial. Never your contact details, work rights or pay. Search engines don't list it."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <span>Link gone somewhere you didn't want? Make a new one and the old one stops.</span>
            <Button variant="outline" size="sm" disabled={renewing} onClick={renew}>
              New link
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Your share link" className="font-mono" />
            <Button type="button" variant="outline" onClick={() => copy(url, "Link")}>
              <Copy aria-hidden />
              Copy
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button type="button" size="sm" onClick={nativeShare}>
                <Share2 aria-hidden />
                Share
              </Button>
            )}
            {channels.map((channel) => (
              <Button key={channel.label} asChild size="sm" variant="outline">
                <a href={channel.href} target="_blank" rel="noreferrer">
                  {channel.label}
                </a>
              </Button>
            ))}
            <Button asChild size="sm" variant="ghost">
              <a href={sharePath} target="_blank" rel="noreferrer">
                Open it
              </a>
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="A post for Instagram and TikTok"
        description="They don't let you put links in posts, so download this picture with your link on it. Put the link in your bio too."
      >
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <PostImage post={post} />
          <div className="space-y-2">
            <p className="font-medium text-sm">A caption to go with it</p>
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">{caption}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(caption, "Caption")}
            >
              <Copy aria-hidden />
              Copy caption
            </Button>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Salons they hide from
// ---------------------------------------------------------------------------

function HiddenSalons({ salons }: { salons: Schemas["HiddenSalon"][] }) {
  const refresh = useRefresh();
  const search = useAction();
  const [results, setResults] = useState<Schemas["DirectorySalon"][] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const hiddenIds = new Set(salons.map((s) => s.id));

  async function setHidden(salonId: string, hidden: boolean, name: string) {
    setPending(salonId);
    try {
      const params = { params: { path: { salonId } } };
      unwrap(
        hidden
          ? await api.PUT("/v1/me/hidden-salons/{salonId}", params)
          : await api.DELETE("/v1/me/hidden-salons/{salonId}", params),
      );
      if (hidden) setResults(null);
      await refresh(hidden ? `Hidden from ${name}` : `${name} can see your profile again`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <SectionCard
      title="Hide from salons"
      description="Your current salon, say. A salon you hide from can't see or contact you, unless you apply to one of its jobs."
    >
      <div className="space-y-4">
        {salons.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {salons.map((salon) => (
              <li key={salon.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <span className="font-medium">{salon.name}</span>
                  <span className="block text-muted-foreground">
                    {salon.suburb}, {salon.state}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => setHidden(salon.id, false, salon.name)}
                >
                  Show again
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={search.submit(async (form) => {
            const q = String(form.get("q") ?? "").trim();
            if (!q) return;
            const found = unwrap(await api.GET("/v1/salons", { params: { query: { q } } }));
            setResults(found.items.slice(0, 8));
          })}
        >
          <Input name="q" placeholder="Salon name, suburb or postcode" aria-label="Find a salon" />
          <SubmitButton pending={search.pending} variant="outline">
            Find
          </SubmitButton>
        </form>
        <FormMessage message={search.message} />
        {results && (
          <ul className="divide-y rounded-lg border">
            {results.length === 0 && (
              <li className="p-3 text-muted-foreground text-sm">No salons found.</li>
            )}
            {results.map((salon) => (
              <li key={salon.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  <span className="font-medium">{salon.name}</span>
                  <span className="block text-muted-foreground">
                    {salon.suburb}, {salon.state}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null || hiddenIds.has(salon.id)}
                  onClick={() => setHidden(salon.id, true, salon.name)}
                >
                  {hiddenIds.has(salon.id) ? "Hidden" : "Hide from them"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
