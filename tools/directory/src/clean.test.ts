import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchAbns, matchRecord } from "./abr";
import {
  auPhone,
  chunk,
  dedupe,
  email,
  instagramHandle,
  type Listing,
  nameKey,
  nameKeys,
  type Place,
  placeToListing,
  postcodeOf,
  suburbName,
  toCsv,
  website,
} from "./clean";

const place = (overrides: Partial<Place> = {}): Place => ({
  id: "08f1",
  name: "Jo-Han Hair",
  category: "hair_salon",
  address: { freeform: "2/11 Ramu Parade", locality: "Melbourne", postcode: "3081", region: "VIC" },
  phones: ["+61390789005"],
  websites: ["http://jo-han-hair.com.au/"],
  emails: ["Hello@Jo-Han.com.au"],
  socials: ["https://www.facebook.com/123", "https://instagram.com/johanhair/"],
  confidence: 0.88,
  operating_status: null,
  sal_name: "Heidelberg West",
  sal_state: "Victoria",
  poa: "3081",
  ...overrides,
});
const options = { minConfidence: 0.5 };

describe("placeToListing", () => {
  test("a good place becomes a listing with the pin's suburb, not the address's city", () => {
    expect(placeToListing(place(), options)).toEqual({
      kind: "listing",
      listing: {
        id: "08f1",
        confidence: 0.88,
        name: "Jo-Han Hair",
        suburb: "Heidelberg West",
        state: "VIC",
        postcode: "3081",
        address: "2/11 Ramu Parade",
        phone: "+61390789005",
        email: "hello@jo-han.com.au",
        website: "http://jo-han-hair.com.au/",
        instagram: "johanhair",
        abn: "",
      },
    });
  });

  test.each([
    [{ name: "  " }, "no name"],
    [{ name: "x".repeat(201) }, "name longer than 200 characters"],
    [{ operating_status: "permanently_closed" }, "marked permanently closed"],
    [{ confidence: 0.31 }, "low confidence (0.31)"],
    [{ confidence: null }, "low confidence (0.00)"],
    [{ sal_name: null }, "map pin isn't in an Australian suburb"],
    [{ sal_state: "Other Territories" }, "in Other Territories"],
    [{ address: null, poa: null }, "no postcode"],
  ] as [Partial<Place>, string][])("%o is dropped: %s", (overrides, reason) => {
    expect(placeToListing(place(overrides), options)).toEqual({ kind: "dropped", reason });
  });

  test("an open place is kept", () => {
    expect(placeToListing(place({ operating_status: "open" }), options).kind).toBe("listing");
  });

  test("no published postcode: the pin's postal area is used", () => {
    const outcome = placeToListing(place({ address: null, poa: "3081" }), options);
    expect(outcome.kind === "listing" && outcome.listing.postcode).toBe("3081");
  });

  test("the published postcode and the pin disagree: sent to review", () => {
    const outcome = placeToListing(place({ poa: "3084" }), options);
    expect(outcome).toMatchObject({
      kind: "review",
      listing: { postcode: "3081", suburb: "Heidelberg West" },
      note: "The address says postcode 3081, but the map pin is in Heidelberg West 3084",
    });
  });

  test("a pin in an ABS area that isn't a suburb: sent to review", () => {
    const outcome = placeToListing(place({ sal_name: "ACT Remainder - Tuggeranong" }), options);
    expect(outcome).toMatchObject({
      kind: "review",
      note: 'The map pin is in "ACT Remainder - Tuggeranong", an ABS area that isn\'t a suburb',
    });
  });

  test("a multi-line street address becomes one line", () => {
    const outcome = placeToListing(
      place({
        address: {
          freeform: "Shop 4\n 182 Monash Dr",
          locality: null,
          postcode: "3081",
          region: null,
        },
      }),
      options,
    );
    expect(outcome.kind === "listing" && outcome.listing.address).toBe("Shop 4, 182 Monash Dr");
  });
});

test.each([
  ["Richmond (Vic.)", "Richmond"],
  ["Alison (Central Coast - NSW)", "Alison"],
  ["Heidelberg West", "Heidelberg West"],
])("suburbName(%p) is %p", (input, expected) => expect(suburbName(input)).toBe(expected));

test.each([
  ["3000", "3000"],
  [" 0800 ", "0800"],
  ["VIC 3000", null],
  ["300", null],
  [null, null],
])("postcodeOf(%p) is %p", (input, expected) => expect(postcodeOf(input)).toBe(expected));

test.each([
  ["+61390789005", "+61390789005"],
  ["(03) 9078 9005", "+61390789005"],
  ["0412 345 678", "+61412345678"],
  ["61412345678", "+61412345678"],
  ["+6412345678", null],
  ["131 313", null],
])("auPhone(%p) is %p", (input, expected) => expect(auPhone(input)).toBe(expected));

test.each([
  ["Info@Salon.com.au", "info@salon.com.au"],
  ["mailto:info@salon.com.au", "info@salon.com.au"],
  ["not an email", null],
])("email(%p) is %p", (input, expected) => expect(email(input)).toBe(expected));

test.each([
  ["https://salon.com.au/", "https://salon.com.au/"],
  ["www.salon.com.au", "https://www.salon.com.au/"],
  ["https://www.facebook.com/salon", null],
  ["https://instagram.com/salon", null],
  ["ftp://salon.com.au", null],
])("website(%p) is %p", (input, expected) => expect(website(input)).toBe(expected));

test.each([
  ["https://www.instagram.com/jo.han_hair/", "jo.han_hair"],
  ["instagram.com/johan?igsh=abc", "johan"],
  ["https://www.instagram.com/p/Cx123/", null],
  ["https://www.facebook.com/johan", null],
])("instagramHandle(%p) is %p", (input, expected) => expect(instagramHandle(input)).toBe(expected));

test.each([
  ["Jo-Han Hair", "jo han hair"],
  ["JO-HAN HAIR PTY LTD", "jo han hair"],
  ["The Hair Lounge", "hair lounge"],
  ["Hair & Co", "hair and co"],
  ["Café Brows", "cafe brows"],
  ["Sarah's Salon", "sarahs salon"],
  ["The", "the"],
])("nameKey(%p) is %p", (input, expected) => expect(nameKey(input)).toBe(expected));

test.each([
  [
    "Cute or Dye Hairdressing - Lawnton",
    ["cute or dye hairdressing lawnton", "cute or dye hairdressing"],
  ],
  ["Brows - Westfield", ["brows westfield"]],
  ["Belle Brow Bar (St Kilda)", ["belle brow bar st kilda", "belle brow bar"]],
  ["Jo-Han Hair", ["jo han hair"]],
])("nameKeys(%p) is %p", (input, expected) => expect(nameKeys(input)).toEqual(expected));

describe("dedupe", () => {
  const row = (id: string, name: string, postcode: string, confidence: number) => ({
    listing: { id, name, postcode, confidence } as Listing,
  });

  test("keeps the most confident place per name and postcode", () => {
    const a = row("a", "Jo-Han Hair", "3081", 0.6);
    const b = row("b", "jo-han hair ", "3081", 0.9);
    const c = row("c", "Jo-Han Hair", "3000", 0.5);
    const { kept, duplicates } = dedupe([a, b, c]);
    expect(kept).toEqual([b, c]);
    expect(duplicates).toEqual([{ item: a, of: "b" }]);
  });
});

describe("matchRecord", () => {
  const wanted = new Map([["3081", new Map([["jo han hair", [0]]])]]);
  const record = (abn: string, status: string, postcode: string, names: string[], replaced = "N") =>
    `<ABR recordLastUpdatedDate="20240101" replaced="${replaced}"><ABN status="${status}" ABNStatusFromDate="20200101">${abn}</ABN><MainEntity>${names
      .map(
        (n) =>
          `<NonIndividualName type="MN"><NonIndividualNameText>${n}</NonIndividualNameText></NonIndividualName>`,
      )
      .join(
        "",
      )}<BusinessAddress><AddressDetails><State>VIC</State><Postcode>${postcode}</Postcode></AddressDetails></BusinessAddress></MainEntity></ABR>`;

  test("an active ABN with the same name and postcode matches", () => {
    expect(
      matchRecord(record("51824753556", "ACT", "3081", ["JO-HAN HAIR PTY LTD"]), wanted),
    ).toEqual({
      abn: "51824753556",
      indexes: [0],
    });
  });

  test("a business name decoded from XML matches", () => {
    const want = new Map([["3081", new Map([["hair and co", [3]]])]]);
    expect(
      matchRecord(record("51824753556", "ACT", "3081", ["HAIR &amp; CO"]), want)?.indexes,
    ).toEqual([3]);
  });

  test.each([
    ["a cancelled ABN", record("51824753556", "CAN", "3081", ["JO-HAN HAIR"])],
    ["another postcode", record("51824753556", "ACT", "3000", ["JO-HAN HAIR"])],
    ["another name", record("51824753556", "ACT", "3081", ["JOHAN HAIR STUDIO"])],
    ["a replaced ABN", record("51824753556", "ACT", "3081", ["JO-HAN HAIR"], "Y")],
  ])("%s doesn't match", (_, line) => expect(matchRecord(line, wanted)).toBeNull());
});

describe("matchAbns", () => {
  const line = (abn: string, postcode: string, name: string) =>
    `<ABR recordLastUpdatedDate="20240101" replaced="N"><ABN status="ACT" ABNStatusFromDate="20200101">${abn}</ABN><MainEntity><NonIndividualName type="MN"><NonIndividualNameText>${name}</NonIndividualNameText></NonIndividualName><BusinessAddress><AddressDetails><State>VIC</State><Postcode>${postcode}</Postcode></AddressDetails></BusinessAddress></MainEntity></ABR>`;
  const listing = (name: string, postcode: string) => ({ name, postcode, abn: "" }) as Listing;

  test("gives an ABN only when it is the one match, for one listing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "abr-"));
    const xml = [
      '<?xml version="1.0"?><Transfer>',
      line("11111111111", "3081", "JO-HAN HAIR"),
      line("22222222222", "3000", "SALON ONE"),
      line("33333333333", "3000", "SALON ONE PTY LTD"),
      line("44444444444", "3121", "BROWS AND CO"),
      "</Transfer>",
    ].join("\n");
    writeFileSync(join(dir, "Public01.xml"), xml);
    await Bun.$`zip -q -j ${join(dir, "abr.zip")} ${join(dir, "Public01.xml")}`;

    const listings = [
      listing("Jo-Han Hair", "3081"),
      listing("Salon One", "3000"), // two ABNs: ambiguous
      listing("Brows & Co", "3121"), // the same ABN as the next one: shared
      listing("Brows and Co.", "3121"),
      listing("Nobody", "3081"),
    ];
    const result = await matchAbns(listings, [join(dir, "abr.zip")]);
    expect(result).toEqual({ matched: 1, ambiguous: 1, shared: 2, records: 4 });
    expect(listings.map((l) => l.abn)).toEqual(["11111111111", "", "", "", ""]);
  });
});

test("toCsv quotes cells that need it", () => {
  expect(
    toCsv([{ name: 'Hair "by" Jo, Ltd', suburb: "Richmond" }], ["name", "suburb", "abn"]),
  ).toBe('name,suburb,abn\n"Hair ""by"" Jo, Ltd",Richmond,\n');
});

test("chunk splits into files", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});
