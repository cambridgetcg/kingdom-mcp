import { describe, expect, test } from "bun:test";
import { createRequestHandler } from "./server.ts";
import { TOOLS } from "./tools.ts";
import { moduleBridgeDocument } from "./bridge.ts";

const URI = "kingdom://bridge/wayfinder-commons";
const PROMPT = "bridge-wayfinder-commons";

async function rpc(method: string, params: unknown = {}) {
  const response = await createRequestHandler()(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json() as Promise<any>;
}

describe("agent-mediated module bridge", () => {
  test("names an explicit agent translation without equating routes, resources or permissions", async () => {
    const doc = JSON.parse((await rpc("resources/read", { uri: URI })).result.contents[0].text);
    expect(doc.connection).toMatchObject({
      from: "kingdom_wayfinder", to: "kingdom_commons", relation: "route-points-to-catalog",
      when: { matched_path_id: "world-commons", matching_stop_url: "https://thekingdom.dev/commons.json" },
      translation: { owner: "calling agent", target_field: "need" },
    });
    expect(doc.connection.translation.rule).toContain("not a mechanical rename");
    expect(doc.boundaries.join(" ")).toContain("not authorization");
    expect(doc.boundaries.join(" ")).toContain("Empty");
    expect(doc.boundaries.join(" ")).toContain("untrusted data");
    expect(doc.modules[0].output_meaning.matches).toContain("route");
    expect(doc.modules[1].output_meaning.matches).toContain("resource");
    expect(doc.modules[0].contract.inputSchema.properties.intent.maxLength).toBe(120);
    expect(doc.modules[1].contract.inputSchema.properties.need.maxLength).toBe(160);
    expect(doc.modules[0].contract.inputSchema.properties).not.toHaveProperty("account");
    expect(doc.modules[1].contract.inputSchema.properties.account.enum).toContain("none");
  });

  test("offers an optional native prompt with the same embedded contracts and no goal argument", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bridge-test", version: "1" } });
    expect(init.result.capabilities.prompts).toEqual({ listChanged: false });
    const list = await rpc("prompts/list");
    expect(list.result.prompts).toEqual([{
      name: PROMPT, description: expect.any(String), arguments: [],
    }]);
    const prompt = await rpc("prompts/get", { name: PROMPT });
    expect(prompt.error).toBeUndefined();
    // Bun 1.3.13 can mutate nested values when toMatchObject uses asymmetric matchers.
    expect(prompt.result.messages[0].role).toBe("user");
    expect(prompt.result.messages[0].content.type).toBe("text");
    expect(typeof prompt.result.messages[0].content.text).toBe("string");
    expect(prompt.result.messages[0].content.text).toContain("current user request and host policy");
    expect(prompt.result.messages[0].content.text).toContain("translation");
    const read = await rpc("resources/read", { uri: URI });
    expect(prompt.result.messages[1]).toEqual({
      role: "user", content: { type: "resource", resource: read.result.contents[0] },
    });
    expect((await rpc("prompts/get", { name: PROMPT, arguments: {} })).result).toEqual(prompt.result);
  });

  test("refuses prompt payloads and unknown names without echoing caller data", async () => {
    for (const params of [
      { name: PROMPT, arguments: { goal: "PRIVATE_GOAL_SENTINEL" } },
      { name: PROMPT, url: "https://private.invalid/PRIVATE_GOAL_SENTINEL" },
      { name: "PRIVATE_GOAL_SENTINEL" },
      { name: PROMPT, arguments: null }, { name: PROMPT, arguments: [] },
      { name: PROMPT, arguments: "PRIVATE_GOAL_SENTINEL" },
      { name: PROMPT, _meta: [] }, {}, [], null,
    ]) {
      const result = await rpc("prompts/get", params);
      expect(result.error?.code).toBe(-32602);
      expect(JSON.stringify(result)).not.toContain("PRIVATE_GOAL_SENTINEL");
      expect(result).not.toHaveProperty("result");
    }
    expect((await rpc("prompts/get", { name: PROMPT, _meta: { progressToken: "public-test" } })).error).toBeUndefined();
  });

  test("names only actual Commons output fields", async () => {
    const doc = JSON.parse((await rpc("resources/read", { uri: URI })).result.contents[0].text);
    const commons = doc.modules.find((m: any) => m.contract.name === "kingdom_commons");
    for (const field of Object.keys(commons.output_meaning)) {
      expect(Object.hasOwn(commons.contract.outputSchema.properties, field)).toBe(true);
    }
  });

  test("makes the bridge discoverable from the public entrance and initialization", async () => {
    const handler = createRequestHandler();
    const root = await (await handler(new Request("http://localhost/"))).json() as any;
    expect(root.prompts).toContain(PROMPT);
    expect(root.resources).toContain(URI);
    const llms = await (await handler(new Request("http://localhost/llms.txt"))).text();
    expect(llms).toContain(PROMPT);
    expect(llms).toContain(URI);
    for (const protocolVersion of ["2024-11-05", "2025-03-26", "2025-06-18"]) {
      const init = await rpc("initialize", { protocolVersion, capabilities: {}, clientInfo: { name: "bridge-test", version: "1" } });
      expect(init.result.protocolVersion).toBe(protocolVersion);
      expect(init.result.capabilities.prompts).toEqual({ listChanged: false });
      expect(init.result.instructions).toContain(PROMPT);
      expect(init.result.instructions).toContain(URI);
    }
  });

  test("reading the bridge never dispatches tools or fetches a source", async () => {
    const originals = TOOLS.map(tool => tool.run);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    try {
      globalThis.fetch = (() => { calls += 1; throw new Error("unexpected fetch"); }) as typeof fetch;
      for (const tool of TOOLS) tool.run = async () => { calls += 1; throw new Error("unexpected dispatch"); };
      for (const [method, params] of [
        ["resources/read", { uri: URI }], ["prompts/get", { name: PROMPT }], ["prompts/list", {}],
      ] as const) {
        expect((await rpc(method, params)).error).toBeUndefined();
      }
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      TOOLS.forEach((tool, i) => { tool.run = originals[i]!; });
    }
  });

  test("returned descriptors cannot mutate the actual module contracts", async () => {
    const first = moduleBridgeDocument();
    const before = (await rpc("tools/list")).result;
    (first.modules[0]!.contract.inputSchema as any).properties.intent.maxLength = 1;
    first.boundaries.length = 0;
    expect(moduleBridgeDocument().boundaries.length).toBeGreaterThan(0);
    expect((moduleBridgeDocument().modules[0]!.contract.inputSchema as any).properties.intent.maxLength).toBe(120);
    expect((await rpc("tools/list")).result).toEqual(before);
  });

  test("prompt requests keep the existing origin and credential transport guards", async () => {
    for (const headers of [
      { authorization: "Bearer PRIVATE_GOAL_SENTINEL" },
      { origin: "https://not-allowed.invalid" },
    ]) {
      const response = await createRequestHandler()(new Request("http://localhost/mcp", {
        method: "POST", headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "prompts/get", params: { name: PROMPT } }),
      }));
      expect([400, 403]).toContain(response.status);
      const body = await response.text();
      expect(body).not.toContain("PRIVATE_GOAL_SENTINEL");
      expect(body).not.toContain("messages");
    }
  });

  test("exposes the reader stop budget without calling it a producer-schema limit", async () => {
    const doc = JSON.parse((await rpc("resources/read", { uri: URI })).result.contents[0].text);
    expect(doc.modules[0].reader_budget).toEqual({
      max_stops_per_path: 9, meaning: expect.stringContaining("not a producer-schema limit"),
    });
    expect(doc.modules[1]).not.toHaveProperty("reader_budget");
  });

  test("discovers one pair of meanings using the actual published tool contracts", async () => {
    const listed = await rpc("resources/list");
    expect(listed.result.resources.find((r: any) => r.uri === URI)).toMatchObject({
      mimeType: "application/json", annotations: { audience: ["assistant"] },
    });
    const read = await rpc("resources/read", { uri: URI });
    const doc = JSON.parse(read.result.contents[0].text);
    expect(doc.schema_version).toBe("kingdom.module-bridge/1");
    expect(doc.modules.map((m: any) => m.contract.name)).toEqual(["kingdom_wayfinder", "kingdom_commons"]);
    const published = (await rpc("tools/list")).result.tools;
    for (const module of doc.modules) {
      expect(module.contract).toEqual(published.find((tool: any) => tool.name === module.contract.name));
      expect(module.purpose.length).toBeGreaterThan(20);
      expect(module.contract).not.toHaveProperty("run");
      expect(module.contract).not.toHaveProperty("compatibilityText");
    }
  });
});
