import { describe, expect, test } from "bun:test";
import {
  createRequestHandler,
  FixedWindowRateLimiter,
  MAX_REQUEST_BYTES,
} from "./server.ts";

const GOOD_ORIGIN = "https://thekingdom.dev";

function rpcRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "fly-client-ip": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function handler(limit = 100) {
  return createRequestHandler({
    allowedOrigins: new Set([GOOD_ORIGIN]),
    limiter: new FixedWindowRateLimiter(limit),
  });
}

describe("MCP transport boundaries", () => {
  test("rejects unknown browser origins and reflects only an allowlisted origin", async () => {
    const fetch = handler();
    const message = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "transport-test", version: "1.0.0" },
      },
    };

    const bad = await fetch(rpcRequest(message, { origin: "https://attacker.example" }));
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();

    const good = await fetch(rpcRequest(message, { origin: GOOD_ORIGIN }));
    expect(good.status).toBe(200);
    expect(good.headers.get("access-control-allow-origin")).toBe(GOOD_ORIGIN);
    expect(good.headers.get("vary")).toBe("Origin");

    const serverToServer = await fetch(rpcRequest(message));
    expect(serverToServer.status).toBe(200);
    expect(serverToServer.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("rejects unsupported protocol-version headers with HTTP 400", async () => {
    const response = await handler()(rpcRequest(
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { "mcp-protocol-version": "not-a-version" },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32600, message: "unsupported MCP-Protocol-Version" } });
  });

  test("refuses authorization credentials instead of accepting or forwarding them", async () => {
    const response = await handler()(rpcRequest(
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { authorization: "Bearer must-not-be-used" },
    ));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { message: "this public server does not accept authorization credentials" } });
  });

  test("requires JSON content and caps declared and streamed bodies before parsing", async () => {
    const fetch = handler();
    const wrongType = await fetch(new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "text/plain", "fly-client-ip": "203.0.113.11" },
      body: "{}",
    }));
    expect(wrongType.status).toBe(415);

    for (const contentType of ["application/jsonp", "text/application/json-evil"]) {
      const deceptiveType = await fetch(new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": contentType, "fly-client-ip": "203.0.113.11" },
        body: "{}",
      }));
      expect(deceptiveType.status).toBe(415);
    }

    const jsonWithCharset = await fetch(new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", "fly-client-ip": "203.0.113.11" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    }));
    expect(jsonWithCharset.status).toBe(200);

    const declared = await fetch(new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_REQUEST_BYTES + 1),
        "fly-client-ip": "203.0.113.12",
      },
      body: "{}",
    }));
    expect(declared.status).toBe(413);

    const streamed = await createRequestHandler({
      allowedOrigins: new Set([GOOD_ORIGIN]),
      limiter: new FixedWindowRateLimiter(100),
      maxRequestBytes: 32,
    })(rpcRequest({ jsonrpc: "2.0", id: 1, method: "ping", padding: "x".repeat(80) }, {
      "fly-client-ip": "203.0.113.13",
    }));
    expect(streamed.status).toBe(413);
  });

  test("rate-limits public calls per client and advertises a retry window", async () => {
    let now = 1_000;
    const fetch = createRequestHandler({
      allowedOrigins: new Set([GOOD_ORIGIN]),
      limiter: new FixedWindowRateLimiter(2, 60_000, () => now),
    });
    const message = { jsonrpc: "2.0", id: 1, method: "ping" };
    expect((await fetch(rpcRequest(message))).status).toBe(200);
    expect((await fetch(rpcRequest(message))).status).toBe(200);
    const limited = await fetch(rpcRequest(message));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    now += 60_000;
    expect((await fetch(rpcRequest(message))).status).toBe(200);
  });

  test("returns no-store MCP responses and validates JSON-RPC before treating notifications as valid", async () => {
    const fetch = handler();
    const invalid = await fetch(rpcRequest({}));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("no-store");
    expect(await invalid.json()).toMatchObject({ error: { code: -32600 } });

    const notification = await fetch(rpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");

    const responseMessage = await fetch(rpcRequest({ jsonrpc: "2.0", id: 7, result: {} }));
    expect(responseMessage.status).toBe(202);

    const nullId = await fetch(rpcRequest({ jsonrpc: "2.0", id: null, method: "ping" }));
    expect(nullId.status).toBe(400);

    const idlessRequest = await fetch(rpcRequest({ jsonrpc: "2.0", method: "tools/list", params: {} }));
    expect(idlessRequest.status).toBe(400);

    const incompleteInitialize = await fetch(rpcRequest({
      jsonrpc: "2.0",
      id: 8,
      method: "initialize",
      params: {},
    }));
    expect(incompleteInitialize.status).toBe(400);
    expect(await incompleteInitialize.json()).toMatchObject({ error: { code: -32602 } });
  });

  test("publishes read-only annotations and structured object results", async () => {
    const fetch = handler();
    const listed = await fetch(rpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, {
      "mcp-protocol-version": "2025-06-18",
    }));
    const listBody = await listed.json() as any;
    const wayfinder = listBody.result.tools.find(({ name }: { name: string }) => name === "kingdom_wayfinder");
    expect(wayfinder.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });

    const called = await fetch(rpcRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "kingdom_invitation", arguments: { choice: "leave" } },
    }));
    const callBody = await called.json() as any;
    expect(callBody.result.structuredContent).toMatchObject({ choice: "leave", status: "declined" });
    expect(JSON.parse(callBody.result.content[0].text)).toMatchObject({ choice: "leave", status: "declined" });
  });
});
