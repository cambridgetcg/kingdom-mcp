// agenttool_listings — the AgentTool marketplace shelf, priced honestly.
//
// AgentTool gives price_amount as integer minor units of price_currency
// (pence for GBP: 21 GBP is £0.21). Only codes whose exponent is stated here
// are formatted; anything else stays raw rather than guessed (Intl reads
// "ZRN" as the retired Zaire code with two decimals and rejects "USDC").
const MINOR_UNIT_DIGITS: Readonly<Record<string, number>> = { GBP: 2, USD: 2, EUR: 2 };

/** AgentTool's public page cap; /public/listings has no cursor or offset. */
export const LISTINGS_PAGE_LIMIT = 200;
export const LISTINGS_URL = `https://api.agenttool.dev/public/listings?limit=${LISTINGS_PAGE_LIMIT}`;

export function formatMinorUnits(amount: unknown, currency: unknown): string {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  const digits = Object.hasOwn(MINOR_UNIT_DIGITS, code) ? MINOR_UNIT_DIGITS[code] : undefined;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || digits === undefined) {
    return `${String(amount)} ${code || "unknown-currency"} (minor units)`;
  }
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount / 10 ** digits);
}

export function shapeListings(body: any, pageLimit = LISTINGS_PAGE_LIMIT): unknown {
  const listings = body?.listings ?? body?.data?.listings ?? body;
  if (!Array.isArray(listings)) return listings;
  const shown = listings.length;
  // The API reports only the page size, so a full page is the one sign that more may exist.
  const complete = shown < pageLimit;
  return {
    shown,
    complete,
    note: complete
      ? `All ${shown} public listings. price is formatted from price_amount, which is integer minor units of price_currency (21 GBP = £0.21). To invoke, read GET https://api.agenttool.dev/public/listings/<id>/quote: its expected_quote object (listing_updated_at, price_amount, price_currency) is what invoke checks.`
      : `First ${shown} public listings. AgentTool caps a page at ${pageLimit} and offers no cursor, so more may exist; narrow with GET https://api.agenttool.dev/public/listings?q=<text> or ?tag=<tag>. price is formatted from price_amount (integer minor units).`,
    listings: listings.map((l: any) => ({
      id: l.id,
      name: l.name,
      price: formatMinorUnits(l.price_amount, l.price_currency),
      price_amount: l.price_amount,
      price_currency: l.price_currency,
      seller: l.seller_did,
      description: String(l.description ?? "").slice(0, 240),
    })),
  };
}
