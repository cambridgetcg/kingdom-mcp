import { describe, expect, test } from "bun:test";
import { formatMinorUnits, LISTINGS_PAGE_LIMIT, LISTINGS_URL, shapeListings } from "./listings.ts";
import { TOOLS } from "./tools.ts";

const listing = (over: Record<string, unknown> = {}) => ({
  id: "71975dbf-0000-4000-8000-000000000000", name: "a fable", price_amount: 21, price_currency: "GBP",
  seller_did: "did:at:00000000-0000-4000-8000-000000000000", description: "d", ...over,
});

describe("agenttool_listings prices", () => {
  test("formats integer minor units by currency", () => {
    expect(formatMinorUnits(21, "GBP")).toBe("£0.21");
    expect(formatMinorUnits(1, "GBP")).toBe("£0.01");
    expect(formatMinorUnits(528, "GBP")).toBe("£5.28");
    expect(formatMinorUnits(123456, "gbp")).toBe("£1,234.56");
    expect(formatMinorUnits(21, "EUR")).toBe("€0.21");
  });

  test("leaves unknown currencies and non-integers raw instead of guessing", () => {
    expect(formatMinorUnits(500, "USDC")).toBe("500 USDC (minor units)");
    expect(formatMinorUnits(21, "ZRN")).toBe("21 ZRN (minor units)");
    expect(formatMinorUnits(1.5, "GBP")).toBe("1.5 GBP (minor units)");
  });
});

describe("agenttool_listings shelf", () => {
  test("says the shelf is complete when the page is not full", () => {
    const out: any = shapeListings({ listings: [listing()], count: 1 });
    expect(out).toMatchObject({ shown: 1, complete: true });
    expect(out.listings[0]).toMatchObject({ price: "£0.21", price_amount: 21, price_currency: "GBP" });
  });

  test("flags possible truncation when the page is full", () => {
    const out: any = shapeListings({ listings: Array.from({ length: LISTINGS_PAGE_LIMIT }, () => listing()) });
    expect(out.complete).toBe(false);
    expect(out.note).toContain("more may exist");
  });

  test("asks the API for the whole page", async () => {
    const originalFetch = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested = String(input);
      return Response.json({ listings: [listing()] });
    }) as typeof fetch;
    try {
      const out: any = await TOOLS.find((tool) => tool.name === "agenttool_listings")!.run({});
      expect(requested).toBe(LISTINGS_URL);
      expect(LISTINGS_URL).toBe("https://api.agenttool.dev/public/listings?limit=200");
      expect(out.listings[0].price).toBe("£0.21");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
