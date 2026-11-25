# Listing checks: is a salon still open, and are its details right?

**Status:** Proposal (2026-11-25). Not built. Run when Matt chooses, not on a schedule.

## The problem

The directory has about 46,000 listings imported from Overture Maps (D-09). Over time salons close, move,
change their phone or email, or sell. A listing with stale details wastes job seekers' time, and a listing
with no email can't be claimed by email link (D-04): about half have none today. We want to:
- find listings that have probably **closed**
- fill in a **phone number and email** where a listing has none
- spot listings whose details **no longer match** what the business publishes.

## What it runs on: a script, run when wanted

A run is occasional (once, then again when Matt decides), so it's a script in `tools/directory`, like the
directory builder, not a scheduled Worker:

```bash
bun tools/directory/check.ts out/listings.csv     # an hour or two for every listing with a website
```

- **No new infrastructure.** Nothing to deploy, nothing running when it isn't wanted, no cost.
- **Reuses what the directory builder already downloads:** the ABN Bulk Extract and Overture Places.
- **Nothing changes until it's reviewed:** the script writes CSVs. Matt looks at them, then applies them in
  the admin portal.
- **The trade-off:** it runs on Matt's computer, for an hour or two. If it should ever run without a
  computer, the same checks can move to a Worker started from the admin portal (see "Later").

## How a run works

1. **Export.** Admin portal, Directory → "Download listings": a CSV of every **unclaimed** directory listing
   (ID, name, place, address, phone, email, website, Instagram, ABN). Claimed salons are left out: their
   owners keep their own details.
2. **Check.** The script works through the CSV and gathers evidence for each listing:

   | Check | How | What it tells us |
   |---|---|---|
   | Its own website | Home page and a contact page, at most 3 pages. Reads `mailto:` and `tel:` links, the business's structured data (schema.org `LocalBusiness`), and links to Instagram and booking pages | Phone, email, address, opening hours; whether the site is gone, parked, for sale, says "we've closed", or now belongs to someone else |
   | ABN | Its status in the latest ABN Bulk Extract (no lookups needed) | A cancelled ABN usually means closed or sold. Also finds an ABN for listings without one, as the builder does |
   | Overture | The latest release, matched on name and postcode | Gone from Overture, marked closed, or confidence dropped |
   | Email domain | A DNS check that the domain still receives mail | Whether the address can work at all |

3. **Decide.** A pure rule, `listingHealth`, in `packages/shared` with table tests (like the other rules)
   turns each listing's evidence into one outcome:
   - **Fill:** the listing lacks a phone or email, and the salon's own website clearly shows one (for
     example, an email on the salon's own domain).
   - **Review: details differ:** the website shows a different phone, email or address.
   - **Review: likely closed:** two or more strong signals, e.g. website gone **and** ABN cancelled, or
     gone from Overture **and** website parked. One weak signal alone changes nothing.
   - **OK:** nothing to do.
4. **Output** (`tools/directory/out/<date>/checks/`):
   - `fill.csv`: listing ID, the field, the value, and where it was found (URL and date)
   - `review.csv`: listing ID, what's wrong, and the evidence
   - a summary in the terminal: how many of each.
5. **Apply.**
   - `fill.csv` → admin portal, Directory → "Apply updates". It only fills **empty** fields, skips listings
     claimed or edited since the export, and records each change in the audit log with its source.
   - `review.csv` → Matt works through it with "Edit details" and "Remove from site" on each salon's page.
     Nothing is hidden automatically.

Running it again later starts from a fresh export, so it rechecks everything and never repeats a fill.

## What it won't do

- **No Google Maps, Facebook, Instagram or booking platforms** (Fresha, Timely). Their terms forbid
  scraping, and D-04 rules out scraped Google data. Links to them found on the salon's own site are kept
  as links.
- **No logins, forms or anything behind a search box.** Only public pages.
- **No marketing to the emails it finds** (see below).

## Being a good visitor

- Obeys each site's `robots.txt`, one page at a time per site, gives up after 8 seconds, and at most about
  20 sites at once.
- Identifies itself as `SalonStaffBot/1.0 (+https://salonstaff.com.au/bot)`, with a page there saying what
  it reads and how to opt out.
- A site that only works with JavaScript is skipped and counted. A headless browser (Playwright, run
  locally) is a later option if that's a lot of salons.

## Legal

- **Spam Act 2003.** The ban on address harvesting (s22) only applies to addresses used for sending
  commercial messages without consent (s22(2)). The claim email is factual (who asked, a confirm link,
  "ignore this if you didn't expect it"), so it isn't commercial (s6) and may go to a found address.
  **Keep it that way:** no offers in it ("90 days free", prices), and no unsolicited "claim your listing"
  emails to found addresses. Any marketing to salons goes only to people who opted in.
- **Privacy Act.** A sole trader's mobile or Gmail is personal information. The privacy page should say
  we collect business contact details the business has published, and owners need a way to have them
  removed (claiming the listing, or asking support).
- Not legal advice: worth a short check with a lawyer before the first run.

## What it needs in the app

1. Admin: **Download listings** (CSV export of unclaimed directory listings).
2. Admin: **Apply updates** (imports `fill.csv`: fills empty fields only, audited with the source).
3. Website: a `/bot` page about SalonStaffBot, and a line in the privacy page.
4. `listingHealth` in `packages/shared/src/rules.ts`, with table tests.

## Phases

1. Export, the website check, `fill.csv`, Apply updates. The quickest win: more emails, so more claims by
   email link.
2. ABN and Overture signals, `listingHealth`, `review.csv`.
3. If wanted: a headless browser for JavaScript-only sites.

## Later, if it should run without Matt's computer

Move the checks into a separate Worker (`apps/checker`) started from the admin portal ("Run checks"),
working through a Cloudflare Queue and writing the same evidence to a table, with a review page in the
admin portal. It fits the $5-a-month Workers plan. Not worth building while runs are occasional.

## Open decisions (Matt)

- Fill automatically, or put every found email and phone through review first?
- Check every unclaimed listing, or only those missing an email or phone first?
- Is a lawyer's look at the Spam Act and privacy points wanted before the first run?
