import { describe, expect, test } from "bun:test";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeStatus, statusSummary, type ProbeService } from "./status-probe.ts";
import { TOOLS, probeableServices } from "./tools.ts";
import EMBEDDED from "./registry.gen.json";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const service = (over: Partial<ProbeService> = {}): ProbeService => ({
  id: "fixture", status: "live", urls: { health: "https://example.com/health" }, ...over,
});
const probe = (over: Partial<ProbeService>, response: Response) =>
  probeStatus(service(over), async () => response, () => NOW);
const chain = (time: unknown, over: Record<string, unknown> = {}) => ({
  result: { sync_info: { latest_block_time: time, latest_block_height: "42", catching_up: false, ...over } },
});

// All HTTP replies are fixtures. No test contacts any registry endpoint.
describe("status probe backward compatibility", () => {
  test("keeps status-only rows and expected HTTP codes unchanged", async () => {
    const cases: Array<[number, number | number[] | undefined, string]> = [
      [200, undefined, "up"], [302, undefined, "up"], [401, undefined, "down"],
      [401, 401, "up"], [404, [404], "up"], [500, undefined, "down"],
    ];
    for (const [status, expected, observed] of cases) {
      expect(await probe({ expect: expected }, new Response("<html>shell</html>", { status })))
        .toEqual({ id: "fixture", expected: "live", observed, code: status, ms: 0 });
    }
  });

  test("uses exactly the declared URL and no second RPC request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await probeStatus(service({
      urls: { health: "https://example.com/status", api: "https://example.com/api", site: "https://example.com" },
      block_max_age_sec: 60,
    }), async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(chain("2026-10-19T11:59:59Z"));
    }, () => NOW);
    expect(result.observed).toBe("up");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://example.com/status");
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0].init?.redirect).toBe("error");
  });

  test("refuses redirects for opt-in rows but preserves the legacy redirect policy", async () => {
    for (const over of [{}, { expect_type: "application/json" }, { expect_json: { non_empty_array: "models" } }, { block_max_age_sec: 60 }]) {
      let policy: RequestRedirect | undefined;
      await probeStatus(service(over), async (_url, init) => {
        policy = init?.redirect;
        return Response.json({ models: [1], ...chain("2026-10-19T11:59:59Z") });
      }, () => NOW);
      expect(policy).toBe(Object.keys(over).length ? "error" : "follow");
    }
  });

  test("retains bounded transport errors", async () => {
    const result = await probeStatus(service(), async () => { throw new Error("x".repeat(100)); }, () => NOW);
    expect(result).toEqual({ id: "fixture", expected: "live", observed: "down", ms: 0, error: "x".repeat(60) });
  });

  test("preserves legacy summary and alerts only expected-live failures", () => {
    expect(statusSummary([
      { id: "ok", expected: "live", observed: "up", code: 200, ms: 0 },
      { id: "off", expected: "dormant", observed: "down", ms: 0 },
    ])).toBe("1/2 up — all quiet");
    expect(statusSummary([{ id: "broken", expected: "live", observed: "down", ms: 0 }]))
      .toBe("0/1 up — ⚠ broken DOWN");
  });
});

describe("opt-in response assertions", () => {
  test("rejects a 200 HTML shell at a JSON path", async () => {
    const result = await probe({ expect_type: "application/json", urls: { health: "https://example.com/data.json" } },
      new Response("<html>fallback shell</html>", { headers: { "content-type": "text/html" } }));
    expect(result).toMatchObject({ observed: "down", code: 200, error: "unexpected content-type" });
  });

  test("requires exact media types, ignoring case and response parameters", async () => {
    expect((await probe({ expect_type: "application/json" }, new Response("{}", {
      headers: { "content-type": "Application/JSON; charset=utf-8" },
    }))).observed).toBe("up");
    for (const type of ["text/html", "application/jsonp", "application/problem+json", "text/application/json"]) {
      expect((await probe({ expect_type: "application/json" }, new Response("{}", { headers: { "content-type": type } }))).observed).toBe("down");
    }
    expect((await probe({ expect_type: "application/json" }, new Response(new Uint8Array([123, 125])))).observed).toBe("down");
    expect((await probe({ expect_type: "text/plain" }, new Response("healthy", { headers: { "content-type": "text/plain" } }))).observed).toBe("up");
  });

  test("does not trust a JSON header on an HTML or malformed body", async () => {
    for (const body of ["<html>private fixture text</html>", "{broken", ""]) {
      const result = await probe({ expect_type: "application/json" }, new Response(body, { headers: { "content-type": "application/json" } }));
      expect(result).toMatchObject({ observed: "down", code: 200, error: "invalid JSON response" });
      expect(JSON.stringify(result)).not.toContain("private fixture text");
    }
    expect((await probe({ expect_type: "application/problem+json" }, new Response("{}", {
      headers: { "content-type": "application/problem+json" },
    }))).observed).toBe("up");
  });

  test("requires a non-empty models array, not just truthy content", async () => {
    for (const models of [[], null, {}, "one", 1]) {
      expect((await probe({ expect_json: { non_empty_array: "models" } }, Response.json({ models }))))
        .toMatchObject({ observed: "down", code: 200, error: "expected non-empty JSON array" });
    }
    expect((await probe({ expect_json: { non_empty_array: "models" } }, Response.json({}))).observed).toBe("down");
    expect((await probe({ expect_json: { non_empty_array: "models" } }, Response.json({ models: [{ name: "fixture" }] }))).observed).toBe("up");
  });

  test("supports own-property dotted paths, not inherited values", async () => {
    expect((await probe({ expect_json: { non_empty_array: "data.models" } }, Response.json({ data: { models: [1] } }))).observed).toBe("up");
    expect((await probe({ expect_json: { non_empty_array: "constructor" } }, Response.json({}))).observed).toBe("down");
  });

  test("expected status codes do not bypass content checks", async () => {
    expect((await probe({ expect: [401], expect_type: "application/json", expect_json: { non_empty_array: "models" } },
      Response.json({ models: [] }, { status: 401 }))).observed).toBe("down");
    expect((await probe({ expect_type: "application/json" }, Response.json({ ok: true }, { status: 500 })))).toEqual({
      id: "fixture", expected: "live", observed: "down", code: 500, ms: 0,
    });
  });

  test("fails closed on malformed opt-in contracts", async () => {
    for (const contract of [
      { expect_type: "" }, { expect_type: "application/json; charset=utf-8" }, { expect_type: 1 },
      { expect_json: null }, { expect_json: {} }, { expect_json: { non_empty_array: "" } },
      { expect_json: { non_empty_array: "models", unknown: true } }, { expect_json: { non_empty_array: "data..models" } },
      { block_max_age_sec: 0 }, { block_max_age_sec: -1 }, { block_max_age_sec: "60" },
      { block_max_age_sec: Number.NaN }, { block_max_age_sec: Number.POSITIVE_INFINITY },
    ]) {
      expect((await probe(contract as Partial<ProbeService>, Response.json({ models: [1], ...chain("2026-10-19T11:59:59Z") }))).observed).toBe("down");
    }
  });

  test("bounds streamed JSON bytes and cancels rejected bodies", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); },
      cancel() { cancelled = true; },
    });
    const result = await probe({ expect_json: { non_empty_array: "models" } }, new Response(body));
    expect(result).toMatchObject({ observed: "down", error: "JSON response exceeds 256 KiB" });
    expect(cancelled).toBe(true);
  });
});

describe("neutral rest markers", () => {
  test("a present marker skips HTTP and produces no failure or green success", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kingdom-status-test-"));
    const marker = join(dir, "REST");
    await writeFile(marker, "the contents must not enter a status result");
    let calls = 0;
    try {
      const result = await probeStatus(service({ rest_file: marker, expect_type: "application/json", block_max_age_sec: 60 }), async () => {
        calls++;
        throw new Error("a resting row must not fetch");
      }, () => NOW);
      expect(calls).toBe(0);
      expect(result).toEqual({ id: "fixture", expected: "live", observed: "resting", ms: 0 });
      expect(statusSummary([result])).toBe("1 resting — all quiet");
      expect(statusSummary([result, { id: "ok", expected: "live", observed: "up", ms: 0 }])).toBe("1/1 up, 1 resting — all quiet");
      expect(statusSummary([result, { id: "broken", expected: "live", observed: "down", ms: 0 }])).toBe("0/1 up, 1 resting — ⚠ broken DOWN");
      expect(JSON.stringify(result)).not.toContain(marker);
    } finally {
      await unlink(marker);
      await rmdir(dir);
    }
  });

  test("an absent marker resumes the ordinary probe; invalid markers are not rest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kingdom-status-test-"));
    try {
      expect((await probe({ rest_file: join(dir, "absent") }, new Response("ok"))).observed).toBe("up");
      expect((await probe({ rest_file: dir }, new Response("ok")))).toMatchObject({ observed: "down", error: "cannot check rest_file" });
      expect((await probe({ rest_file: "" }, new Response("ok")))).toMatchObject({ observed: "down", error: "invalid rest_file" });
    } finally {
      await rmdir(dir);
    }
  });
});

describe("opt-in CometBFT halt detection", () => {
  test("a halted chain is down even while its RPC returns HTTP 200", async () => {
    const result = await probe({ block_max_age_sec: 60 }, Response.json(chain("2026-10-19T11:58:59Z")));
    expect(result).toMatchObject({ observed: "down", code: 200 });
    expect(result.error).toContain("HALTED");
    expect(statusSummary([result])).toContain("fixture DOWN");
  });

  test("accepts fresh wrapped and unwrapped status, including the exact age boundary", async () => {
    for (const body of [chain("2026-10-19T11:59:00Z"), chain("2026-10-19T11:59:59Z").result,
      chain("2026-10-19T12:59:59.123456789+01:00")]) {
      expect((await probe({ block_max_age_sec: 60 }, Response.json(body))).observed).toBe("up");
    }
    expect((await probe({ block_max_age_sec: 60 }, Response.json(chain("2026-10-19T11:58:59.999Z"))))).toMatchObject({ observed: "down" });
  });

  test("rejects missing, invalid, future block times and catching-up chains", async () => {
    for (const time of [undefined, null, "not-a-date", 123, "2026-10-19T12:00:01Z",
      "2026-10-19T11:59:59", "2026-10-19", "2026-02-30T11:59:59Z", "2026-10-18T24:00:00Z"]) {
      expect((await probe({ block_max_age_sec: 60 }, Response.json(chain(time)))).observed).toBe("down");
    }
    expect((await probe({ block_max_age_sec: 60 }, Response.json(chain("2026-10-19T11:59:59Z", { catching_up: true })))))
      .toMatchObject({ observed: "down", error: "chain catching up" });
    expect((await probe({ block_max_age_sec: 60 }, new Response("<html>shell</html>"))).observed).toBe("down");
  });

  test("combines assertions and chain age using one response body", async () => {
    const body = { ...chain("2026-10-19T11:59:59Z"), models: [1] };
    expect((await probe({ expect_type: "application/json", expect_json: { non_empty_array: "models" }, block_max_age_sec: 60 }, Response.json(body))).observed).toBe("up");
    expect((await probe({}, Response.json(chain("2020-01-01T00:00:00Z")))).observed).toBe("up");
  });
});

test("kingdom_status delegates to the contract without widening the registry target set", async () => {
  const originalFetch = globalThis.fetch;
  const rows = EMBEDDED.services as ProbeService[];
  const first = rows[0];
  const originalType = first.expect_type;
  first.expect_type = "application/json";
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response("<html>shell</html>", { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  try {
    const result: any = await TOOLS.find(({ name }) => name === "kingdom_status")!.run({});
    expect(calls).toEqual(probeableServices(rows).map((s) => s.urls!.health ?? s.urls!.api ?? s.urls!.site));
    expect(result.results.find(({ id }: any) => id === first.id)).toMatchObject({ observed: "down", code: 200 });
    expect(result.summary).toContain(`${first.id} DOWN`);
    expect(result.results.filter(({ observed }: any) => observed === "down")).toHaveLength(1);
  } finally {
    if (originalType === undefined) delete first.expect_type;
    else first.expect_type = originalType;
    globalThis.fetch = originalFetch;
  }
});
