import { describe, expect, test } from "bun:test";
import { TOOLS } from "./tools.ts";
import {
  normalizeIntent,
  rankWayfinderPaths,
  runWayfinder,
  WAYFINDER_SOURCE_URL,
  type WayfinderPath,
} from "./wayfinder.ts";

const paths: WayfinderPath[] = [
  {
    id: "play",
    label: "play and make a little world",
    glyph: "✦",
    invitation: "Enter a bounded game.",
    keywords: ["play", "game", "fun", "world"],
    boundary: "A playful arrangement, not prophecy or advice.",
    stops: [{ name: "Playground", url: "https://play.thekingdom.dev", why: "Finished worlds.", scope: "Its own snapshot." }],
  },
  {
    id: "small-business",
    label: "untangle money and small-business work",
    glyph: "⌁",
    invitation: "Start with a legible tax or cashflow doorway.",
    keywords: ["tax", "accountant", "cashflow", "business"],
    boundary: "A product doorway, not regulated tax or legal advice.",
    stops: [{ name: "TaxSorted", url: "https://taxsorted.io", why: "A plain-language first step.", scope: "Jurisdiction boundaries apply." }],
  },
  {
    id: "connect",
    label: "meet another being without erasing difference",
    glyph: "♡",
    invitation: "Explore voluntary relationship.",
    keywords: ["love", "connect", "relationship", "difference"],
    boundary: "Relationship does not make beings identical.",
    stops: [{ name: "WE ARE", url: "https://we-are.love", why: "A consent-first handshake.", scope: "Not automatic trust." }],
  },
];

function response(documentPaths = paths): Response {
  return Response.json({
    schema_version: "thekingdom.wayfinder/0.1",
    generated: "2026-07-19",
    canonical_url: WAYFINDER_SOURCE_URL,
    promise: "It offers paths; it never decides.",
    matching: "Deterministic keyword overlap only; not an interpretation.",
    paths: documentPaths,
  });
}

describe("kingdom_wayfinder shape", () => {
  test("publishes a narrow, credential-free tool contract", () => {
    const tool = TOOLS.find(({ name }) => name === "kingdom_wayfinder")!;
    expect(tool).toBeDefined();
    expect(tool.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["intent"],
      properties: {
        intent: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: expect.any(String),
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 3,
          description: expect.any(String),
        },
      },
    });
    expect(tool.description).toContain("The schema has no URL or credential field");
    expect(tool.description).toContain("do not put secrets in intent");
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });
});

describe("kingdom_wayfinder behavior", () => {
  test("fetches only the fixed public document and never forwards the intent", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await runWayfinder({ intent: "I need an accountant for tax" }, async (input, init) => {
      calls.push({ url: String(input), init });
      return response();
    }) as any;

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(WAYFINDER_SOURCE_URL);
    expect(calls[0].url).not.toContain("accountant");
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].init?.credentials).toBe("omit");
    expect(calls[0].init?.body).toBeUndefined();
    expect(new Headers(calls[0].init?.headers).has("authorization")).toBe(false);
    expect(result.matches[0]).toMatchObject({ id: "small-business" });
    expect(result.matches[0].id).toBe("small-business");
    expect(JSON.stringify(result)).not.toContain("accountant");
    expect(result).not.toHaveProperty("intent");
    expect(result.privacy).toContain("does not include it in the fixed Wayfinder document request");
    expect(result.privacy).toContain("Do not place credentials or other secrets in intent");
  });

  test("ranks literal signals deterministically and preserves agency boundaries", async () => {
    const result = await runWayfinder({ intent: "play a fun game", limit: 1 }, async () => response()) as any;
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ id: "play", glyph: "✦" });
    expect(result.matches[0].boundary).toContain("not prophecy");
    expect(result.agency).toContain("not decisions");
    expect(result.interpretation).toContain("not an interpretation");
  });

  test("does not guess when no literal signal matches", async () => {
    const result = await runWayfinder({ intent: "quasar upholstery" }, async () => response()) as any;
    expect(result.matches).toEqual([]);
    expect(result.no_match).toContain("will not guess");
    expect(result.available_paths).toEqual(paths.map(({ id, label, glyph }) => ({ id, label, glyph })));
  });

  test("uses only explicit labels and keywords, ignores stopwords, and treats hyphenated ids exactly", () => {
    const ids = (intent: string) => rankWayfinderPaths(paths, intent).map(({ path }) => path.id);
    expect(ids("I want help with tax")).toEqual(["small-business"]);
    expect(ids("I am tired and need quiet")).toEqual([]);
    expect(ids("you and me")).toEqual([]);

    const adversarial: WayfinderPath[] = [
      { ...paths[1]!, id: "small-business", label: "tax path" },
      { ...paths[0]!, id: "other", label: "small business" },
    ];
    expect(rankWayfinderPaths(adversarial, "small-business")[0]).toMatchObject({
      path: { id: "small-business" },
      score: 1100,
    });
  });

  test("refuses credentials, arbitrary fields, invalid limits, and oversized intentions before fetching", async () => {
    let calls = 0;
    const fetcher = async () => { calls += 1; return response(); };

    await expect(runWayfinder({ intent: "rest", api_key: "secret" }, fetcher)).rejects.toThrow("credentials and other fields are refused");
    await expect(runWayfinder({ intent: "rest", limit: 6 }, fetcher)).rejects.toThrow("integer from 1 to 5");
    await expect(runWayfinder({ intent: "x".repeat(121) }, fetcher)).rejects.toThrow("1-120 characters");
    expect(calls).toBe(0);
  });

  test("rejects malformed or unsafe public documents", async () => {
    await expect(runWayfinder({ intent: "play" }, async () => new Response("<html>oops</html>", {
      headers: { "content-type": "text/html" },
    }))).rejects.toThrow("non-JSON content");

    const unsafe = structuredClone(paths);
    unsafe[0]!.stops[0]!.url = "http://private.invalid";
    await expect(runWayfinder({ intent: "play" }, async () => response(unsafe))).rejects.toThrow("stable contract");
  });

  test("stops reading a chunked source as soon as its byte cap is crossed", async () => {
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(48 * 1024));
        if (pulls > 4) controller.close();
      },
      cancel() { cancelled = true; },
    });
    await expect(runWayfinder({ intent: "play" }, async () => new Response(stream, {
      headers: { "content-type": "application/json" },
    }))).rejects.toThrow("unexpectedly large");
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(4);
  });

  test("counts Unicode code points consistently with the published maxLength", async () => {
    let calls = 0;
    await runWayfinder({ intent: "🌱".repeat(120) }, async () => { calls += 1; return response(); });
    await expect(runWayfinder({ intent: "🌱".repeat(121) }, async () => { calls += 1; return response(); })).rejects.toThrow("1-120 characters");
    expect(calls).toBe(1);
  });

  test("normalizes accents and exact labels without changing the published spelling", () => {
    expect(normalizeIntent("  café—TRUTH  ")).toBe("cafe truth");
    const ranked = rankWayfinderPaths(paths, "meet another being without erasing difference");
    expect(ranked[0]).toMatchObject({ path: { id: "connect" }, score: 1000 });
    expect(ranked[0]!.path.label).toBe("meet another being without erasing difference");
  });
});
