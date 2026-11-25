/**
 * Finds salons' ABNs in the ABN Bulk Extract. Each record is one line of XML, so the zips are
 * streamed through `unzip -p` and read line by line; nothing is unpacked to disk.
 *
 * A match must be an active ABN with a business, trading or entity name equal to the salon's
 * (after `nameKey`) and the same postcode. A salon that matches more than one ABN gets none:
 * a wrong ABN would stop the real owner claiming the listing (D-04), a missing one doesn't.
 */
import { type Listing, nameKey, nameKeys } from "./clean";

export interface AbrResult {
  matched: number;
  /** Salons that matched more than one ABN. */
  ambiguous: number;
  /** Salons whose ABN matched another salon too. */
  shared: number;
  records: number;
}

export async function matchAbns(listings: Listing[], zips: string[]): Promise<AbrResult> {
  // postcode → name key → indexes into listings
  const wanted = new Map<string, Map<string, number[]>>();
  listings.forEach((listing, index) => {
    const byName = wanted.get(listing.postcode) ?? new Map<string, number[]>();
    wanted.set(listing.postcode, byName);
    for (const key of nameKeys(listing.name)) {
      const list = byName.get(key) ?? [];
      list.push(index);
      byName.set(key, list);
    }
  });

  const found = new Map<number, Set<string>>();
  let records = 0;
  await Promise.all(
    zips.map((zip) =>
      eachLine(zip, (line) => {
        if (!line.startsWith("<ABR ")) return;
        records++;
        const hit = matchRecord(line, wanted);
        if (!hit) return;
        for (const index of hit.indexes) {
          const abns = found.get(index) ?? new Set();
          abns.add(hit.abn);
          found.set(index, abns);
        }
      }),
    ),
  );

  // One ABN for one listing only: the import skips a second listing with the same ABN as a
  // duplicate, which would lose a real salon.
  const single = [...found].filter(([, abns]) => abns.size === 1);
  const uses = new Map<string, number>();
  for (const [, abns] of single) for (const abn of abns) uses.set(abn, (uses.get(abn) ?? 0) + 1);
  let matched = 0;
  let shared = 0;
  for (const [index, abns] of single) {
    const abn = [...abns][0] as string;
    if (uses.get(abn) === 1) {
      (listings[index] as Listing).abn = abn;
      matched++;
    } else {
      shared++;
    }
  }
  return { matched, ambiguous: found.size - single.length, shared, records };
}

/** The ABN and the listings one ABR record matches, if any. Exported for tests. */
export function matchRecord(
  line: string,
  wanted: Map<string, Map<string, number[]>>,
): { abn: string; indexes: number[] } | null {
  const postcode = between(line, "<Postcode>", "</Postcode>");
  const byName = postcode && wanted.get(postcode);
  if (!byName) return null;
  if (!line.includes('<ABN status="ACT"') || line.includes('replaced="Y"')) return null;
  const abn = /<ABN [^>]*>(\d{11})<\/ABN>/.exec(line)?.[1];
  if (!abn) return null;
  const indexes = new Set<number>();
  for (const [, text] of line.matchAll(
    /<NonIndividualNameText>([^<]*)<\/NonIndividualNameText>/g,
  )) {
    for (const index of byName.get(nameKey(decodeXml(text as string))) ?? []) indexes.add(index);
  }
  return indexes.size ? { abn, indexes: [...indexes] } : null;
}

function between(line: string, open: string, close: string): string | null {
  const start = line.indexOf(open);
  if (start < 0) return null;
  const end = line.indexOf(close, start);
  return end < 0 ? null : line.slice(start + open.length, end);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(text: string): string {
  return text.replace(/&(#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : (ENTITIES[e] as string),
  );
}

async function eachLine(zip: string, onLine: (line: string) => void) {
  const proc = Bun.spawn(["unzip", "-p", zip], { stdout: "pipe", stderr: "pipe" });
  const decoder = new TextDecoder();
  let rest = "";
  for await (const bytes of proc.stdout) {
    const text = rest + decoder.decode(bytes, { stream: true });
    const lines = text.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  }
  if (rest) onLine(rest);
  if ((await proc.exited) !== 0) {
    throw new Error(`unzip failed on ${zip}: ${await new Response(proc.stderr).text()}`);
  }
}
