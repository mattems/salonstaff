/**
 * Portfolio photos as a grid of thumbnails; clicking one opens it large in a lightbox, with
 * previous and next (buttons, or the arrow keys) and its caption. Plain shadcn Dialog.
 */
import { Button } from "@salonstaff/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@salonstaff/ui/components/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Schemas } from "@/lib/api";

type Item = Schemas["PortfolioItem"];

export function PortfolioGallery({ items, name }: { items: Item[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const current = open === null ? null : items[open];
  const many = items.length > 1;
  const step = (by: number) =>
    setOpen((i) => (i === null ? i : (i + by + items.length) % items.length));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item, i) => (
          <figure key={item.id} className="space-y-1">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="block w-full cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`Open photo ${i + 1} of ${items.length}${item.caption ? `: ${item.caption}` : ""}`}
            >
              <img
                src={item.imageUrl}
                alt={item.caption ?? "Portfolio photo"}
                loading="lazy"
                className="aspect-square w-full rounded-lg border object-cover"
              />
            </button>
            {item.caption && (
              <figcaption className="text-muted-foreground text-xs">{item.caption}</figcaption>
            )}
          </figure>
        ))}
      </div>

      <Dialog open={current !== null} onOpenChange={(isOpen) => !isOpen && setOpen(null)}>
        {current && open !== null && (
          <DialogContent
            className="gap-3 sm:max-w-4xl"
            onKeyDown={(event) => {
              if (!many) return;
              if (event.key === "ArrowRight") step(1);
              if (event.key === "ArrowLeft") step(-1);
            }}
          >
            <DialogTitle className="sr-only">{name}'s portfolio</DialogTitle>
            <DialogDescription className="sr-only">
              Photo {open + 1} of {items.length}. Use the arrow keys for the others.
            </DialogDescription>
            <div className="relative flex items-center justify-center pt-6">
              <img
                src={current.imageUrl}
                alt={current.caption ?? "Portfolio photo"}
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
              />
              {many && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 left-2 -translate-y-1/2"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft aria-hidden />
                    <span className="sr-only">Previous photo</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 right-2 -translate-y-1/2"
                    onClick={() => step(1)}
                  >
                    <ChevronRight aria-hidden />
                    <span className="sr-only">Next photo</span>
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <p>{current.caption}</p>
              {many && (
                <p className="shrink-0 text-muted-foreground">
                  {open + 1} / {items.length}
                </p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
