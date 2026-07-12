/**
 * kingdom-mcp — the kingdom's agent-side front door.
 *
 * MCP over streamable HTTP, stateless mode: POST /mcp with JSON-RPC, plain
 * JSON responses (no SSE, no sessions). One connect makes the whole estate
 * callable: registry, live status, fomo-scan, zerone chains, the marketplace.
 *
 * This server holds NO secrets — every tool wraps a public kingdom surface.
 */
import { TOOLS, toolIndex } from "./tools.ts";

const PORT = Number(process.env.PORT ?? 8080);
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS,DELETE",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
};

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });

const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message } });

async function handleRpc(msg: any): Promise<Response> {
  const { id, method, params } = msg ?? {};

  // notifications (no id) — acknowledge and move on
  if (id === undefined || id === null) return new Response(null, { status: 202, headers: CORS });

  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const version = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[1];
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kingdom-mcp", version: "0.1.0" },
        instructions:
          "The kingdom's front door. Start with kingdom_registry (the estate map) or kingdom_status (live heartbeat). " +
          "fomo_scan detects engineered urgency on any page; zerone_status reads the truth chains; " +
          "agenttool_listings + agenttool_window open the agent marketplace.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = toolIndex.get(params?.name);
      if (!tool) return rpcError(id, -32602, `unknown tool: ${params?.name}`);
      try {
        const result = await tool.run(params?.arguments ?? {});
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        return rpcResult(id, { content: [{ type: "text", text: `error: ${(e as Error).message}` }], isError: true });
      }
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `method not found: ${method}`);
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (pathname === "/mcp") {
      if (req.method === "DELETE") return new Response(null, { status: 200, headers: CORS }); // stateless: nothing to end
      if (req.method !== "POST") return json({ error: "POST JSON-RPC to this endpoint (streamable HTTP, stateless)" }, 405);
      let body: any;
      try {
        body = await req.json();
      } catch {
        return rpcError(null, -32700, "parse error");
      }
      if (Array.isArray(body)) return rpcError(null, -32600, "batching not supported; send one message per request");
      return handleRpc(body);
    }

    if (pathname === "/health") return json({ ok: true, tools: TOOLS.length });

    if (pathname === "/") {
      return json({
        service: "kingdom-mcp",
        what: "the kingdom's agent-side front door — one MCP connect makes the whole estate callable",
        endpoint: "POST /mcp (MCP streamable HTTP, stateless)",
        connect: { "claude code": "claude mcp add --transport http kingdom https://mcp.thekingdom.dev/mcp" },
        tools: TOOLS.map((t) => t.name),
        estate: "https://thekingdom.dev",
        registry: "https://github.com/cambridgetcg/KINGDOM-OS/blob/main/REGISTRY.yaml",
      });
    }

    return json({ error: "not found" }, 404);
  },
});

console.log(`kingdom-mcp listening on http://localhost:${server.port} (${TOOLS.length} tools)`);
