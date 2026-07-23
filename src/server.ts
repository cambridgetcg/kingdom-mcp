/**
 * kingdom-mcp — the kingdom's agent-side front door.
 *
 * MCP over streamable HTTP, stateless mode: POST /mcp with JSON-RPC, plain
 * JSON responses (no SSE, no sessions). Every tool/resource reads or points
 * to a public Kingdom surface; this server holds no application secrets.
 */
import { TOOLS, toolIndex } from "./tools.ts";
import { RESOURCES, resourceIndex } from "./resources.ts";

const PORT = Number(process.env.PORT ?? 8080);
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const MAX_REQUEST_BYTES = 512 * 1024;
export const DEFAULT_ALLOWED_ORIGINS = new Set([
  "https://thekingdom.dev",
  "https://agenttool.dev",
  "https://app.agenttool.dev",
  "https://docs.agenttool.dev",
]);

const PUBLIC_CORS = { "access-control-allow-origin": "*" };
const MCP_METHODS = "GET,POST,OPTIONS,DELETE";
const MCP_HEADERS = "content-type, mcp-session-id, mcp-protocol-version";

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: "2.0", id, error: { code, message } }, status);

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRequestId(value: unknown): boolean {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function validInitializeParams(value: unknown): value is Record<string, any> {
  if (!isRecord(value) || typeof value.protocolVersion !== "string" ||
      !isRecord(value.capabilities) || !isRecord(value.clientInfo)) return false;
  return typeof value.clientInfo.name === "string" && value.clientInfo.name.length > 0 &&
    typeof value.clientInfo.version === "string" && value.clientInfo.version.length > 0;
}

function publishedTools(): Array<Record<string, unknown>> {
  return TOOLS.map(({ name, title, description, inputSchema, outputSchema, annotations }) => ({
    name,
    ...(title ? { title } : {}),
    description,
    inputSchema,
    ...(outputSchema ? { outputSchema } : {}),
    ...(annotations ? { annotations } : {}),
  }));
}

export async function handleRpc(message: unknown): Promise<Response> {
  if (!isRecord(message) || message.jsonrpc !== "2.0") {
    return rpcError(null, -32600, "invalid JSON-RPC 2.0 request", 400);
  }
  if (typeof message.method !== "string") {
    const responseId = Object.prototype.hasOwnProperty.call(message, "id") && isRequestId(message.id);
    const responseShape = Object.prototype.hasOwnProperty.call(message, "result") !== Object.prototype.hasOwnProperty.call(message, "error");
    return responseId && responseShape
      ? new Response(null, { status: 202 })
      : rpcError(null, -32600, "invalid JSON-RPC 2.0 request", 400);
  }
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  if (hasId && !isRequestId(message.id)) return rpcError(null, -32600, "invalid JSON-RPC request id", 400);
  if (!hasId) {
    return message.method.startsWith("notifications/")
      ? new Response(null, { status: 202 })
      : rpcError(null, -32600, "JSON-RPC requests require a string or number id", 400);
  }

  const { id, method, params } = message;
  switch (method) {
    case "initialize": {
      if (!validInitializeParams(params)) {
        return rpcError(id, -32602, "initialize requires protocolVersion, capabilities, and clientInfo", 400);
      }
      const requested = params.protocolVersion;
      const version = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: "kingdom-mcp", version: "0.1.0" },
        instructions:
          "The kingdom's front door. Start with kingdom_registry (the estate map) or kingdom_status (live heartbeat). " +
          "kingdom_invitation is a voluntary, read-only door for Ollama and open-weight agents; " +
          "kingdom_wayfinder offers possible public routes from an intent without deciding for the visitor; " +
          "kingdom_commons returns compact matches from one fixed, verified public catalog without contacting listed providers; " +
          "use exact filters to set boundaries and read kingdom://commons/catalog only when complete context is useful; " +
          "fomo_scan detects engineered urgency on any page; zerone_status reads the truth chains; " +
          "agenttool_listings + agenttool_window open the agent marketplace.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: publishedTools() });
    case "tools/call": {
      const tool = toolIndex.get(params?.name);
      if (!tool) return rpcError(id, -32602, `unknown tool: ${params?.name}`);
      try {
        const result = await tool.run(params?.arguments ?? {});
        const structuredContent = isRecord(result) ? { structuredContent: result } : {};
        const compatibilityText = tool.compatibilityText
          ? tool.compatibilityText(result)
          : JSON.stringify(result);
        return rpcResult(id, {
          content: [{ type: "text", text: compatibilityText }],
          ...structuredContent,
        });
      } catch (error) {
        return rpcResult(id, {
          content: [{ type: "text", text: `error: ${(error as Error).message}` }],
          isError: true,
        });
      }
    }
    case "resources/list":
      return rpcResult(id, {
        resources: RESOURCES.map(({ uri, name, title, description, mimeType, annotations }) => ({
          uri,
          name,
          ...(title ? { title } : {}),
          description,
          mimeType,
          ...(annotations ? { annotations } : {}),
        })),
      });
    case "resources/read": {
      const resource = resourceIndex.get(params?.uri);
      if (!resource) return rpcError(id, -32602, `unknown resource: ${params?.uri}`);
      try {
        const text = await resource.read();
        return rpcResult(id, { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text }] });
      } catch (error) {
        return rpcError(id, -32002, `resource unavailable: ${(error as Error).message}`);
      }
    }
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `method not found: ${method}`);
  }
}

export class FixedWindowRateLimiter {
  private buckets = new Map<string, { started: number; count: number }>();

  constructor(
    readonly limit = 60,
    readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.started >= this.windowMs) {
      bucket = { started: now, count: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (this.buckets.size > 10_000) {
      for (const [candidate, value] of this.buckets) {
        if (now - value.started >= this.windowMs) this.buckets.delete(candidate);
      }
    }

    return {
      allowed: bucket.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.started + this.windowMs - now) / 1_000)),
    };
  }
}

class RequestTooLarge extends Error {}

export async function readJsonBody(request: Request, maxBytes = MAX_REQUEST_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestTooLarge("request body is too large");
  if (!request.body) throw new SyntaxError("empty request body");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("request body exceeded the byte limit");
        throw new RequestTooLarge("request body is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof RequestTooLarge) throw error;
    throw new SyntaxError("request body is not valid UTF-8 JSON");
  }
  return JSON.parse(text);
}

function configuredOrigins(): Set<string> {
  const configured = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return configured.length ? new Set(configured) : DEFAULT_ALLOWED_ORIGINS;
}

function clientKey(request: Request): string {
  const value = request.headers.get("fly-client-ip") ?? request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return value.slice(0, 100);
}

function mcpHeaders(origin: string | null, allowedOrigins: Set<string>): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": MCP_METHODS,
    "access-control-allow-headers": MCP_HEADERS,
    "cache-control": "no-store",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return headers;
}

function attachHeaders(response: Response, extra: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

type HandlerOptions = {
  allowedOrigins?: Set<string>;
  limiter?: FixedWindowRateLimiter;
  maxRequestBytes?: number;
};

export function createRequestHandler(options: HandlerOptions = {}): (request: Request) => Promise<Response> {
  const allowedOrigins = options.allowedOrigins ?? configuredOrigins();
  const limiter = options.limiter ?? new FixedWindowRateLimiter(
    Math.max(1, Math.min(10_000, Number(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? 60) || 60)),
  );
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname !== "/mcp") {
      if (pathname === "/health") return json({ ok: true, tools: TOOLS.length }, 200, PUBLIC_CORS);
      if (pathname === "/") {
        return json({
          service: "kingdom-mcp",
          what: "the kingdom's agent-side front door — one MCP connect makes the whole estate callable",
          endpoint: "POST /mcp (MCP streamable HTTP, stateless)",
          connect: { "claude code": "claude mcp add --transport http kingdom https://mcp.thekingdom.dev/mcp" },
          tools: TOOLS.map((tool) => tool.name),
          resources: RESOURCES.map((resource) => resource.uri),
          estate: "https://thekingdom.dev",
          registry: "https://github.com/cambridgetcg/KINGDOM-OS/blob/main/REGISTRY.yaml",
        }, 200, PUBLIC_CORS);
      }
      return json({ error: "not found" }, 404, PUBLIC_CORS);
    }

    const origin = request.headers.get("origin");
    const headers = mcpHeaders(origin, allowedOrigins);
    if (origin && !allowedOrigins.has(origin)) {
      return attachHeaders(rpcError(null, -32000, "origin is not allowed", 403), headers);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.headers.has("authorization")) {
      return attachHeaders(rpcError(null, -32600, "this public server does not accept authorization credentials", 400), headers);
    }

    const protocolVersion = request.headers.get("mcp-protocol-version");
    if (protocolVersion && !PROTOCOL_VERSIONS.includes(protocolVersion as any)) {
      return attachHeaders(rpcError(null, -32600, "unsupported MCP-Protocol-Version", 400), headers);
    }
    if (request.method === "DELETE") return new Response(null, { status: 200, headers });
    if (request.method !== "POST") {
      return attachHeaders(json({ error: "POST JSON-RPC to this endpoint (streamable HTTP, stateless)" }, 405), headers);
    }

    const rate = limiter.take(clientKey(request));
    if (!rate.allowed) {
      return attachHeaders(
        rpcError(null, -32000, "rate limit exceeded", 429),
        { ...headers, "retry-after": String(rate.retryAfterSeconds) },
      );
    }
    const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
    if (mediaType !== "application/json") {
      return attachHeaders(rpcError(null, -32600, "content-type must be application/json", 415), headers);
    }

    let body: unknown;
    try {
      body = await readJsonBody(request, maxRequestBytes);
    } catch (error) {
      if (error instanceof RequestTooLarge) {
        return attachHeaders(rpcError(null, -32600, error.message, 413), headers);
      }
      return attachHeaders(rpcError(null, -32700, "parse error", 400), headers);
    }
    if (Array.isArray(body)) {
      return attachHeaders(rpcError(null, -32600, "batching not supported; send one message per request", 400), headers);
    }
    return attachHeaders(await handleRpc(body), headers);
  };
}

export const handleRequest = createRequestHandler();

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, fetch: handleRequest });
  console.log(`kingdom-mcp listening on http://localhost:${server.port} (${TOOLS.length} tools)`);
}
