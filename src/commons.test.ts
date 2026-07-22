import { describe, expect, test } from "bun:test";
import {
  COMMONS_ACCOUNTS,
  COMMONS_AUTOMATION_STATUSES,
  COMMONS_CATEGORY_IDS,
  COMMONS_COSTS,
  COMMONS_DETAIL_LEVELS,
  COMMONS_OUTPUT_SCHEMA,
  COMMONS_RESOURCE_URI,
  COMMONS_REUSE_STATUSES,
  COMMONS_SCHEMA_VERSION,
  COMMONS_SOURCE_TIMEOUT_MS,
  COMMONS_SOURCE_URL,
  MAX_COMMONS_SOURCE_BYTES,
  normalizeCommonsText,
  rankCommonsResources,
  runCommons,
  validateCommonsDocument,
  type CommonsDocument,
} from "./commons.ts";
import { TOOLS } from "./tools.ts";

function catalog(): CommonsDocument {
  return {
    schema_version: COMMONS_SCHEMA_VERSION,
    generated: "2026-07-22T12:34:56Z",
    verified: "2026-07-22",
    canonical_url: COMMONS_SOURCE_URL,
    promise: "A curated public shelf, not a claim that every service is unlimited.",
    methodology: {
      summary: "Official sources checked by humans; literal matching only.",
      classification: "Open resources are kept distinct from public access and limited free tiers.",
      maintenance: "Recheck source facts and dates as the catalog changes.",
      boundary: "Catalog inclusion is not endorsement or professional advice.",
    },
    privacy: {
      human_surface: "The human page can filter the catalog locally.",
      machine_surface: "Machine queries are not part of this static source.",
    },
    foundation: {
      meaning: "A broad first shelf for civilisational usefulness, not an objective ranking of worth.",
      criteria: [
        "Useful to many different communities.",
        "A meaningful free path with legible terms.",
        "Provenance and automation boundaries can be stated.",
      ],
      resource_ids: ["osv", "openstax", "project-gutenberg"],
    },
    categories: [
      { id: "knowledge", label: "Knowledge", glyph: "⌘", description: "Reference and evidence." },
      { id: "learning", label: "Learning", glyph: "△", description: "Study and teaching." },
      { id: "earth", label: "Earth", glyph: "◉", description: "Planet and place." },
      { id: "public-life", label: "Public life", glyph: "◇", description: "Public institutions and civic data." },
      { id: "rights", label: "Rights", glyph: "⚖", description: "Rights and accessible participation." },
      { id: "resilience", label: "Resilience", glyph: "⌁", description: "Practical continuity and care." },
      { id: "security", label: "Security", glyph: "⬡", description: "Defensive software knowledge." },
      { id: "culture", label: "Culture", glyph: "✦", description: "Books, art, and shared memory." },
    ],
    kits: [
      {
        id: "guardrail-bundle",
        label: "Make a small project safer",
        glyph: "⬡",
        invitation: "Check dependencies before deciding what to patch.",
        keywords: ["security", "vulnerability", "dependency"],
        resource_ids: ["osv"],
        boundary: "A signal, not a complete security audit.",
        steps: ["Inventory dependencies.", "Check matching advisories.", "Review before changing software."],
      },
      {
        id: "learning-shelf",
        label: "Build a free learning shelf",
        glyph: "△",
        invitation: "Choose a subject and keep the license visible.",
        keywords: ["learn", "textbook", "course"],
        resource_ids: ["openstax", "project-gutenberg"],
        boundary: "Open study materials do not automatically confer credentials.",
        steps: ["Choose a subject.", "Read the title-level terms.", "Keep attribution with reused material."],
      },
    ],
    resources: [
      {
        id: "osv",
        name: "OSV.dev",
        provider: "Google Open Source Security Team",
        category_ids: ["security"],
        description: "An open vulnerability database and query API for software packages.",
        good_for: ["Checking dependency versions against known advisories."],
        coverage: "Multiple package ecosystems; source coverage varies.",
        keywords: ["security", "vulnerability", "dependency", "advisory"],
        audiences: ["developers", "maintainers", "agents"],
        access: { cost: "free", account: "none", note: "The public API currently requires no key." },
        reuse: { status: "mixed", license: "source-dependent", note: "Keep advisory provenance." },
        automation: { status: "supported", auth: "none", limits: "No published rate limit at verification.", note: "Bulk dumps are available." },
        links: [
          { label: "OSV API", url: "https://google.github.io/osv.dev/api/", type: "docs" },
          { label: "OSV query endpoint", url: "https://api.osv.dev/v1/query", type: "api" },
        ],
        caveat: "Coverage and source licensing vary; absence of a match is not proof of safety.",
        verified: "2026-07-22",
      },
      {
        id: "openstax",
        name: "OpenStax",
        provider: "Rice University",
        category_ids: ["learning", "knowledge"],
        description: "Free peer-reviewed textbooks for common subjects.",
        good_for: ["Structured self-study.", "Citation-backed tutoring."],
        coverage: "More than 80 textbook titles.",
        keywords: ["education", "textbook", "learn", "accounting"],
        audiences: ["students", "teachers", "agents"],
        access: { cost: "free", account: "none", note: "Web and PDF reading has no paywall." },
        reuse: { status: "noncommercial", license: "CC BY-NC-SA for most current titles", note: "Verify each title and version." },
        automation: { status: "limited", auth: "none", limits: "No catalog API promised.", note: "Do not scrape aggressively." },
        links: [{ label: "OpenStax", url: "https://openstax.org/", type: "start" }],
        caveat: "Current editions are often noncommercial and do not provide course credit.",
        verified: "2026-07-22",
      },
      {
        id: "project-gutenberg",
        name: "Project Gutenberg",
        provider: "Project Gutenberg Literary Archive Foundation",
        category_ids: ["culture", "knowledge"],
        description: "A large library of ebooks that are public domain in the United States.",
        good_for: ["Offline reading.", "Public-domain literary discovery."],
        coverage: "US public-domain ebooks in many languages.",
        keywords: ["books", "ebooks", "literature", "culture"],
        audiences: ["readers", "teachers", "agents"],
        access: { cost: "free", account: "none", note: "Supported mirrors and feeds are available." },
        reuse: { status: "mixed", license: "US public domain plus Project Gutenberg terms", note: "Check copyright where reuse occurs." },
        automation: { status: "bulk-preferred", auth: "none", limits: "Do not scrape the main website.", note: "Use robot-access guidance." },
        links: [{ label: "Robot access", url: "https://www.gutenberg.org/policy/robot_access.html", type: "docs" }],
        caveat: "A work public domain in the US may remain protected elsewhere.",
        verified: "2026-07-22",
      },
    ],
  };
}

function sourceResponse(
  document: unknown = catalog(),
  options: { contentType?: string; url?: string; status?: number; contentLength?: string; body?: BodyInit } = {},
): Response {
  const body = options.body ?? JSON.stringify(document);
  const headers = new Headers({ "content-type": options.contentType ?? "application/json; charset=utf-8" });
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  const response = new Response(body, { status: options.status ?? 200, headers });
  Object.defineProperty(response, "url", { value: options.url ?? COMMONS_SOURCE_URL });
  return response;
}

const commonsTool = TOOLS.find(({ name }) => name === "kingdom_commons")!;

function briefResource(resource: CommonsDocument["resources"][number]) {
  const { keywords: _keywords, audiences: _audiences, ...brief } = resource;
  return brief;
}

function briefKit(kit: CommonsDocument["kits"][number], matchingResourceIds: string[]) {
  const { glyph: _glyph, keywords: _keywords, ...brief } = kit;
  return { ...brief, matching_resource_ids: matchingResourceIds };
}

describe("kingdom_commons published contract", () => {
  test("publishes compact detail and exact machine filters with a stable output schema", () => {
    expect(commonsTool).toBeDefined();
    expect(commonsTool.title).toBe("Find free public resources");
    expect(commonsTool.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["need"],
      properties: {
        need: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: expect.any(String),
        },
        category: {
          type: "string",
          enum: COMMONS_CATEGORY_IDS,
          description: expect.any(String),
        },
        cost: {
          type: "string",
          enum: COMMONS_COSTS,
          description: expect.any(String),
        },
        account: {
          type: "string",
          enum: COMMONS_ACCOUNTS,
          description: expect.any(String),
        },
        reuse: {
          type: "string",
          enum: COMMONS_REUSE_STATUSES,
          description: expect.any(String),
        },
        automation: {
          type: "string",
          enum: COMMONS_AUTOMATION_STATUSES,
          description: expect.any(String),
        },
        detail: {
          type: "string",
          enum: COMMONS_DETAIL_LEVELS,
          default: "brief",
          description: expect.any(String),
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 8,
          default: 5,
          description: expect.any(String),
        },
      },
    });
    expect(commonsTool.outputSchema).toBe(COMMONS_OUTPUT_SCHEMA);
    expect(commonsTool.description).toContain(COMMONS_SOURCE_URL);
    expect(commonsTool.description).toContain("never follows resource links or calls providers");
    expect(commonsTool.description).toContain("never forwards need or copies it into a dedicated response field");
    expect(commonsTool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });
});

describe("kingdom_commons fixed-source and privacy boundaries", () => {
  test("makes exactly one anonymous fixed GET and never contacts a listed provider", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const privateNeed = "security sapphire-passphrase-991";
    const result = await runCommons({ need: privateNeed, limit: 1 }, async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input) !== COMMONS_SOURCE_URL) throw new Error("provider must not be contacted");
      return sourceResponse();
    }) as any;

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(COMMONS_SOURCE_URL);
    expect(calls[0]!.url).not.toContain("sapphire");
    expect(calls[0]!.init).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(calls[0]!.init?.body).toBeUndefined();
    const headers = new Headers(calls[0]!.init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
    expect(COMMONS_SOURCE_TIMEOUT_MS).toBe(12_000);

    expect(result.detail).toBe("brief");
    expect(result.catalog_resource).toBe(COMMONS_RESOURCE_URI);
    expect(result).not.toHaveProperty("catalog");
    expect(result.matches).toEqual([briefResource(catalog().resources[0]!)]);
    expect(result.matches[0].links[1].url).toBe("https://api.osv.dev/v1/query");
    expect(result.provider_boundary).toContain("No listed provider was contacted");
    expect(result.privacy_boundary).toContain("not put in the catalog request, persisted, or returned as a field");
    expect(result.privacy_boundary).toContain("Canonical catalog text may naturally contain");
    expect(result.no_guess).toContain("not endorsements");
    expect(JSON.stringify(result)).not.toContain(privateNeed);
    expect(JSON.stringify(result)).not.toContain("sapphire");
    expect(result).not.toHaveProperty("need");
  });

  test("does not mistake natural catalog overlap for a copied query field", async () => {
    const result = await runCommons({ need: "OSV.dev" }, async () => sourceResponse()) as any;
    expect(result.matches[0].name).toBe("OSV.dev");
    expect(result).not.toHaveProperty("need");
    expect(result.privacy_boundary).toContain("Canonical catalog text may naturally contain");
  });

  test("returns full metadata only when requested while respecting category and limit", async () => {
    const result = await runCommons({ need: "textbook learn", category: "learning", detail: "full", limit: 1 }, async () => sourceResponse()) as any;
    expect(result.detail).toBe("full");
    expect(result.matches).toEqual([catalog().resources[1]]);
    expect(result.matched_kits).toEqual([{ ...catalog().kits[1], matching_resource_ids: ["openstax"] }]);
    expect(result.catalog.categories).toEqual(catalog().categories);
    expect(result.catalog.foundation).toEqual(catalog().foundation);
    expect(result.source).toEqual({
      url: COMMONS_SOURCE_URL,
      canonical_url: COMMONS_SOURCE_URL,
      schema_version: COMMONS_SCHEMA_VERSION,
      generated: "2026-07-22T12:34:56Z",
      verified: "2026-07-22",
    });
  });

  test("returns an explicit empty result rather than guessing", async () => {
    const result = await runCommons({ need: "quasar upholstery" }, async () => sourceResponse()) as any;
    expect(result.matches).toEqual([]);
    expect(result.matched_kits).toEqual([]);
    expect(result.no_match).toContain("will not guess");
    expect(result.no_guess).toContain("empty match stays empty");
  });

  test("can offer a literally matched kit without inventing a resource match", async () => {
    const result = await runCommons({ need: "guardrail-bundle" }, async () => sourceResponse()) as any;
    expect(result.matches).toEqual([]);
    expect(result.matched_kits).toEqual([briefKit(catalog().kits[0]!, ["osv"])]);
    expect(result).not.toHaveProperty("no_match");
  });

  test("applies exact filters before ranking and identifies kit resources inside that boundary", async () => {
    const result = await runCommons({
      need: "textbook learn",
      category: "learning",
      cost: "free",
      account: "none",
      reuse: "noncommercial",
      automation: "limited",
      limit: 2,
    }, async () => sourceResponse()) as any;

    expect(result.filters).toEqual({
      category: "learning",
      cost: "free",
      account: "none",
      reuse: "noncommercial",
      automation: "limited",
    });
    expect(result.matches.map(({ id }: { id: string }) => id)).toEqual(["openstax"]);
    expect(result.matched_kits[0]).toMatchObject({
      resource_ids: ["openstax", "project-gutenberg"],
      matching_resource_ids: ["openstax"],
    });
  });

  test("refuses extras, invalid filters, invalid limits, and oversized Unicode before fetching", async () => {
    let calls = 0;
    const fetcher = async () => { calls += 1; return sourceResponse(); };
    await expect(runCommons({ need: "books", api_key: "secret" }, fetcher)).rejects.toThrow("credentials and other fields are refused");
    await expect(runCommons({ need: "books", category: "commerce" }, fetcher)).rejects.toThrow("category must be one of");
    await expect(runCommons({ need: "books", cost: "paid" }, fetcher)).rejects.toThrow("cost must be one of");
    await expect(runCommons({ need: "books", account: "secret-account" }, fetcher)).rejects.toThrow("account must be one of");
    await expect(runCommons({ need: "books", reuse: "anything" }, fetcher)).rejects.toThrow("reuse must be one of");
    await expect(runCommons({ need: "books", automation: "scrape" }, fetcher)).rejects.toThrow("automation must be one of");
    await expect(runCommons({ need: "books", detail: "verbose" }, fetcher)).rejects.toThrow("detail must be one of");
    await expect(runCommons({ need: "books", limit: 0 }, fetcher)).rejects.toThrow("integer from 1 to 8");
    await expect(runCommons({ need: "books", limit: 1.5 }, fetcher)).rejects.toThrow("integer from 1 to 8");
    await expect(runCommons({ need: "🌱".repeat(161) }, fetcher)).rejects.toThrow("1-160 characters");
    await expect(runCommons({ need: "   " }, fetcher)).rejects.toThrow("1-160 characters");
    expect(calls).toBe(0);
  });
});

describe("kingdom_commons deterministic matching", () => {
  test("uses literal normalized words, exact ids, stable ties, and category filtering", () => {
    const resources = catalog().resources;
    expect(normalizeCommonsText("  café—SÉCURITY  ")).toBe("cafe security");
    expect(rankCommonsResources(resources, "osv")[0]).toMatchObject({ resource: { id: "osv" }, score: 2_000 });
    expect(rankCommonsResources(resources, "textbook", "security")).toEqual([]);
    expect(rankCommonsResources(resources, "the and please")).toEqual([]);

    const first = structuredClone(resources[0]!);
    first.id = "zulu-security";
    first.name = "Zulu Security";
    first.keywords = ["sentinel"];
    const second = structuredClone(resources[0]!);
    second.id = "alpha-security";
    second.name = "Alpha Security";
    second.keywords = ["sentinel"];
    expect(rankCommonsResources([first, second], "sentinel").map(({ resource }) => resource.id))
      .toEqual(["alpha-security", "zulu-security"]);
  });

  test("returns the same ordered result for repeated calls over the same document", async () => {
    const args = { need: "books textbook culture", limit: 3 };
    const first = await runCommons(args, async () => sourceResponse());
    const second = await runCommons(args, async () => sourceResponse());
    expect(second).toEqual(first);
  });
});

describe("kingdom_commons source hardening", () => {
  test("requires the exact final response URL and refuses redirect-shaped results", async () => {
    await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), {
      url: "https://cdn.example/commons.json",
    }))).rejects.toThrow("resolved away from its fixed canonical URL");
    await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), {
      url: "",
    }))).rejects.toThrow("resolved away from its fixed canonical URL");
  });

  test("accepts application/json parameters but rejects suffix, deceptive, missing, and text media types", async () => {
    await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), {
      contentType: "Application/JSON ; charset=utf-8",
    }))).resolves.toMatchObject({ matches: [{ id: "osv" }] });

    for (const contentType of ["application/problem+json", "application/jsonp", "text/json", "text/html", ""]) {
      await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), { contentType })))
        .rejects.toThrow("non-application/json media type");
    }
  });

  test("rejects non-success status, malformed length, and declared over-size before parsing", async () => {
    await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), { status: 503 })))
      .rejects.toThrow("→ 503");
    await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), { contentLength: "unknown" })))
      .rejects.toThrow("invalid content-length");
    await expect(runCommons({ need: "security" }, async () => sourceResponse(catalog(), {
      contentLength: String(MAX_COMMONS_SOURCE_BYTES + 1),
    }))).rejects.toThrow("unexpectedly large");
  });

  test("cancels a chunked response immediately after crossing the 512 KiB cap", async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(160 * 1024));
        if (pulls > 5) controller.close();
      },
      cancel() { cancelled = true; },
    });
    await expect(runCommons({ need: "security" }, async () => sourceResponse(undefined, { body: stream })))
      .rejects.toThrow("unexpectedly large");
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(5);
  });

  test("rejects invalid UTF-8 and invalid JSON without leaking source contents", async () => {
    const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
    await expect(runCommons({ need: "security" }, async () => sourceResponse(undefined, { body: invalidUtf8 })))
      .rejects.toThrow("could not be read safely");
    await expect(runCommons({ need: "security" }, async () => sourceResponse(undefined, { body: "{private-broken" })))
      .rejects.toThrow("returned invalid JSON");
  });
});

describe("kingdom_commons catalog validation", () => {
  test("accepts the complete stable contract", () => {
    expect(validateCommonsDocument(catalog())).toEqual(catalog());
  });

  test("rejects top-level and nested shape drift", () => {
    const topExtra = { ...catalog(), surprise: true };
    expect(() => validateCommonsDocument(topExtra)).toThrow("commons document has an invalid shape");

    const nestedExtra = catalog() as any;
    nestedExtra.resources[0].access.token = "none";
    expect(() => validateCommonsDocument(nestedExtra)).toThrow("resources[0].access has an invalid shape");

    const linkExtra = catalog() as any;
    linkExtra.resources[0].links[0].tracking = true;
    expect(() => validateCommonsDocument(linkExtra)).toThrow("resources[0].links[0] has an invalid shape");
  });

  test("rejects wrong schema, canonical URL, impossible dates, and unsafe links", () => {
    const wrongSchema = catalog() as any;
    wrongSchema.schema_version = "thekingdom.world-commons/9";
    expect(() => validateCommonsDocument(wrongSchema)).toThrow("unsupported schema_version");

    const wrongCanonical = catalog() as any;
    wrongCanonical.canonical_url = "https://example.com/commons.json";
    expect(() => validateCommonsDocument(wrongCanonical)).toThrow("canonical_url");

    const badDate = catalog() as any;
    badDate.resources[0].verified = "2026-02-30";
    expect(() => validateCommonsDocument(badDate)).toThrow("real date");

    const badGenerated = catalog() as any;
    badGenerated.generated = "2026-07-22T25:00:00";
    expect(() => validateCommonsDocument(badGenerated)).toThrow("ISO date or timezone-qualified datetime");

    const unsafeLink = catalog() as any;
    unsafeLink.resources[0].links[0].url = "https://127.0.0.1/private";
    expect(() => validateCommonsDocument(unsafeLink)).toThrow("uncredentialed HTTPS URL");
  });

  test("requires the exact unique category set and unique resource and kit ids", () => {
    const missingCategory = catalog() as any;
    missingCategory.categories.pop();
    expect(() => validateCommonsDocument(missingCategory)).toThrow("exactly 8 categories");

    const duplicateCategory = catalog() as any;
    duplicateCategory.categories[7].id = "security";
    expect(() => validateCommonsDocument(duplicateCategory)).toThrow("categories contains duplicate ids");

    const duplicateResource = catalog() as any;
    duplicateResource.resources[1].id = "osv";
    expect(() => validateCommonsDocument(duplicateResource)).toThrow("resources contains duplicate ids");

    const duplicateKit = catalog() as any;
    duplicateKit.kits[1].id = "guardrail-bundle";
    expect(() => validateCommonsDocument(duplicateKit)).toThrow("kits contains duplicate ids");
  });

  test("rejects unknown and duplicate category/resource references", () => {
    const unknownCategory = catalog() as any;
    unknownCategory.resources[0].category_ids = ["commerce"];
    expect(() => validateCommonsDocument(unknownCategory)).toThrow("unknown category reference");

    const duplicateCategoryRef = catalog() as any;
    duplicateCategoryRef.resources[0].category_ids = ["security", "security"];
    expect(() => validateCommonsDocument(duplicateCategoryRef)).toThrow("must not contain duplicates");

    const danglingResource = catalog() as any;
    danglingResource.kits[0].resource_ids = ["missing-resource"];
    expect(() => validateCommonsDocument(danglingResource)).toThrow("unknown resource reference");

    const duplicateResourceRef = catalog() as any;
    duplicateResourceRef.kits[0].resource_ids = ["osv", "osv"];
    expect(() => validateCommonsDocument(duplicateResourceRef)).toThrow("must not contain duplicates");

    const danglingFoundation = catalog() as any;
    danglingFoundation.foundation.resource_ids = ["missing-resource"];
    expect(() => validateCommonsDocument(danglingFoundation)).toThrow("foundation.resource_ids contains an unknown resource reference");
  });

  test("exact-validates methodology, privacy, and all published enum fields", () => {
    const methodologyExtra = catalog() as any;
    methodologyExtra.methodology.sources = "official";
    expect(() => validateCommonsDocument(methodologyExtra)).toThrow("commons document.methodology has an invalid shape");

    const privacyMissing = catalog() as any;
    delete privacyMissing.privacy.machine_surface;
    expect(() => validateCommonsDocument(privacyMissing)).toThrow("commons document.privacy has an invalid shape");

    const badCost = catalog() as any;
    badCost.resources[0].access.cost = "sometimes-free";
    expect(() => validateCommonsDocument(badCost)).toThrow("resources[0].access.cost must be one of");

    const badAccount = catalog() as any;
    badAccount.resources[0].access.account = "paid-account";
    expect(() => validateCommonsDocument(badAccount)).toThrow("resources[0].access.account must be one of");

    const badReuse = catalog() as any;
    badReuse.resources[0].reuse.status = "unknown";
    expect(() => validateCommonsDocument(badReuse)).toThrow("resources[0].reuse.status must be one of");

    const badAutomation = catalog() as any;
    badAutomation.resources[0].automation.status = "unbounded";
    expect(() => validateCommonsDocument(badAutomation)).toThrow("resources[0].automation.status must be one of");

    const badAuth = catalog() as any;
    badAuth.resources[0].automation.auth = "api-key";
    expect(() => validateCommonsDocument(badAuth)).toThrow("resources[0].automation.auth must be one of");

    const badLinkType = catalog() as any;
    badLinkType.resources[0].links[0].type = "homepage";
    expect(() => validateCommonsDocument(badLinkType)).toThrow("resources[0].links[0].type must be one of");
  });
});
