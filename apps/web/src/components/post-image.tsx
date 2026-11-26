/**
 * A picture to post on Instagram or TikTok (which don't take links in posts), drawn in the browser
 * from the job seeker's own profile (D-13): photo, name, headline, roles and their share link.
 * Plain black on white until the site has a design.
 */
import { Button } from "@salonstaff/ui/components/button";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PostDetails {
  name: string;
  headline: string | null;
  /** "Colourist · Stylist · Marrickville NSW" */
  line: string;
  /** "salonstaff.com.au/p/k7x2m9qd4h" */
  link: string;
  /** Same-origin URL of their photo, or null. */
  photoUrl: string | null;
}

const SIZES = {
  square: { width: 1080, height: 1080, label: "Square post" },
  story: { width: 1080, height: 1920, label: "Story" },
} as const;
type Size = keyof typeof SIZES;

const INK = "#0a0a0a";
const MUTED = "#737373";
const LINE = "#e5e5e5";
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function draw(canvas: HTMLCanvasElement, size: Size, post: PostDetails) {
  const { width, height } = SIZES[size];
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const story = size === "story";
  const centre = width / 2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  // Photo, or their initials, in a circle.
  const radius = story ? 240 : 170;
  const photoY = story ? 520 : 290;
  const photo = post.photoUrl ? await loadImage(post.photoUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centre, photoY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (photo) {
    const scale = Math.max((radius * 2) / photo.width, (radius * 2) / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.drawImage(photo, centre - w / 2, photoY - h / 2, w, h);
  } else {
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(centre - radius, photoY - radius, radius * 2, radius * 2);
    ctx.fillStyle = MUTED;
    ctx.font = `600 ${radius * 0.7}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(post.name.charAt(0), centre, photoY);
  }
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let y = photoY + radius + (story ? 150 : 110);
  ctx.fillStyle = INK;
  ctx.font = `700 ${story ? 88 : 72}px ${FONT}`;
  ctx.fillText(post.name, centre, y);

  if (post.headline) {
    ctx.font = `400 ${story ? 50 : 40}px ${FONT}`;
    for (const line of wrap(ctx, post.headline, width - 200, 2)) {
      y += story ? 72 : 58;
      ctx.fillText(line, centre, y);
    }
  }
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${story ? 40 : 32}px ${FONT}`;
  for (const line of wrap(ctx, post.line, width - 200, 2)) {
    y += story ? 64 : 50;
    ctx.fillText(line, centre, y);
  }

  const bottom = height - (story ? 220 : 130);
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${story ? 40 : 32}px ${FONT}`;
  ctx.fillText("See my work and endorsements", centre, bottom - (story ? 70 : 56));
  ctx.fillStyle = INK;
  ctx.font = `700 ${story ? 52 : 44}px ${FONT}`;
  ctx.fillText(post.link, centre, bottom);
}

export function PostImage({ post }: { post: PostDetails }) {
  const [size, setSize] = useState<Size>("square");
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvas.current) void draw(canvas.current, size, post);
  }, [size, post]);

  function download() {
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-salon-staff-profile-${size}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(SIZES) as Size[]).map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={key === size ? "secondary" : "outline"}
            aria-pressed={key === size}
            onClick={() => setSize(key)}
          >
            {SIZES[key].label}
          </Button>
        ))}
      </div>
      <canvas
        ref={canvas}
        className="w-full max-w-xs rounded-lg border"
        role="img"
        aria-label={`A ${SIZES[size].label.toLowerCase()} image with your photo, name and share link`}
      />
      <Button type="button" onClick={download}>
        <Download aria-hidden />
        Download image
      </Button>
    </div>
  );
}
