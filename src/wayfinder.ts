export const WAYFINDER_SOURCE_URL = "https://thekingdom.dev/wayfinder.json";

const SOURCE_SCHEMA = "thekingdom.wayfinder/0.1";
const MAX_INTENT_LENGTH = 120;
const MAX_SOURCE_BYTES = 128 * 1024;
const SOURCE_TIMEOUT_MS = 12_000;
const UA = "kingdom-mcp/0.1 (+https://github.com/cambridgetcg/kingdom-mcp)";
const STOPWORDS = new Set([
  "a", "am", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "for", "from",
  "help", "how", "i", "if", "in", "is", "it", "looking", "me", "my", "need", "of", "on", "or",
  "our", "that", "the", "this", "to", "want", "we", "with", "you", "your",
]);

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type WayfinderStop = {
  name: string;
  url: string;
  why: string;
  scope: string;
};

export type WayfinderPath = {
  id: string;
  label: string;
  glyph: string;
  invitation: string;
  keywords: string[];
  boundary: string;
  stops: WayfinderStop[];
};

type WayfinderDocument = {
  schema_version: string;
  generated: string;
  canonical_url: string;
  promise: string;
  matching: string;
  paths: WayfinderPath[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown, max = 2_000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function validateStop(value: unknown): value is WayfinderStop {
  if (!record(value) || !nonempty(value.name, 200) || !nonempty(value.url, 2_000) ||
      !nonempty(value.why) || !nonempty(value.scope)) return false;
  try {
    const url = new URL(value.url);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validatePath(value: unknown): value is WayfinderPath {
  return record(value) &&
    nonempty(value.id, 40) && /^[a-z0-9-]+$/.test(value.id) &&
    nonempty(value.label, 300) && nonempty(value.glyph, 40) &&
    nonempty(value.invitation) && nonempty(value.boundary) &&
    Array.isArray(value.keywords) && value.keywords.length > 0 && value.keywords.length <= 64 &&
    value.keywords.every((keyword) => nonempty(keyword, 100)) &&
    Array.isArray(value.stops) && value.stops.length > 0 && value.stops.length <= 8 &&
    value.stops.every(validateStop);
}

function validateDocument(value: unknown): WayfinderDocument {
  if (!record(value) || value.schema_version !== SOURCE_SCHEMA ||
      !nonempty(value.generated, 100) || !/^\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?$/.test(value.generated) || Number.isNaN(Date.parse(value.generated)) ||
      value.canonical_url !== WAYFINDER_SOURCE_URL ||
      !nonempty(value.promise) || !nonempty(value.matching) ||
      !Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > 64 ||
      !value.paths.every(validatePath)) {
    throw new Error("the public Wayfinder document does not satisfy its stable contract");
  }

  const paths = value.paths as WayfinderPath[];
  if (new Set(paths.map(({ id }) => id)).size !== paths.length) {
    throw new Error("the public Wayfinder document contains duplicate path ids");
  }
  return value as unknown as WayfinderDocument;
}

async function readWayfinder(fetcher: Fetcher): Promise<WayfinderDocument> {
  const response = await fetcher(WAYFINDER_SOURCE_URL, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`public Wayfinder → ${response.status}`);
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new Error("public Wayfinder returned non-JSON content");
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
    throw new Error("public Wayfinder document is unexpectedly large");
  }
  if (response.url && response.url !== WAYFINDER_SOURCE_URL) {
    throw new Error("public Wayfinder resolved away from its fixed canonical URL");
  }

  if (!response.body) throw new Error("public Wayfinder returned an empty body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_SOURCE_BYTES) {
        await reader.cancel("public Wayfinder document exceeded the byte limit");
        throw new Error("public Wayfinder document is unexpectedly large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof Error && error.message === "public Wayfinder document is unexpectedly large") throw error;
    throw new Error("public Wayfinder response could not be read safely");
  }

  try {
    return validateDocument(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("public Wayfinder returned invalid JSON");
    throw error;
  }
}

export function normalizeIntent(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function words(value: string, limit = 16): string[] {
  return [...new Set(normalizeIntent(value).split(" ")
    .filter((word) => (word.length > 1 || /^\d$/.test(word)) && !STOPWORDS.has(word)))].slice(0, limit);
}

export function rankWayfinderPaths(paths: WayfinderPath[], intent: string): Array<{
  path: WayfinderPath;
  score: number;
}> {
  const normalized = normalizeIntent(intent);
  const intentWords = words(intent);
  if (!normalized || !intentWords.length) return [];

  return paths.map((path) => {
    const labelWords = new Set(words(`${path.id} ${path.label}`));
    const keywordWords = new Set(path.keywords.flatMap((keyword) => words(keyword)));
    if (normalized === normalizeIntent(path.id)) return { path, score: 1_100 };
    if (normalized === normalizeIntent(path.label)) return { path, score: 1_000 };
    let score = 0;

    for (const word of intentWords) {
      if (keywordWords.has(word)) score += 16;
      if (labelWords.has(word)) score += 11;
    }
    return { path, score };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.path.label < b.path.label ? -1 : a.path.label > b.path.label ? 1 : 0));
}

function parseArgs(raw: unknown): { intent: string; limit: number } {
  if (!record(raw)) throw new Error("arguments must be an object with intent and optional limit");
  const extra = Object.keys(raw).filter((key) => key !== "intent" && key !== "limit");
  if (extra.length) throw new Error("credentials and other fields are refused; provide only intent and optional limit");
  if (typeof raw.intent !== "string") throw new Error("intent must be a string");
  const intent = raw.intent.trim();
  if (!intent || [...intent].length > MAX_INTENT_LENGTH) {
    throw new Error(`intent must contain 1-${MAX_INTENT_LENGTH} characters`);
  }
  const limit = raw.limit === undefined ? 3 : raw.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 5) {
    throw new Error("limit must be an integer from 1 to 5");
  }
  return { intent, limit: limit as number };
}

export async function runWayfinder(raw: unknown, fetcher: Fetcher = fetch): Promise<unknown> {
  const { intent, limit } = parseArgs(raw);
  const document = await readWayfinder(fetcher);
  const ranked = rankWayfinderPaths(document.paths, intent);

  return {
    source: {
      url: WAYFINDER_SOURCE_URL,
      generated: document.generated,
      schema_version: document.schema_version,
    },
    interpretation: document.matching,
    agency: "These are possible routes, not decisions. Open one, choose another, rest, or leave.",
    privacy: "The MCP server receives the intent because the caller sends it. This tool uses it in memory, does not include the submitted intent or extracted terms as response fields, does not include it in the fixed Wayfinder document request, and does not persist it in application storage. Returned canonical path text may naturally contain words also present in the intent. The MCP host and network infrastructure may still process request data under their own boundaries. Do not place credentials or other secrets in intent.",
    stop_boundary: "Stop URLs are supplied by the canonical Wayfinder document and are not independently re-verified during this call.",
    matches: ranked.slice(0, limit).map(({ path }) => ({
      id: path.id,
      label: path.label,
      glyph: path.glyph,
      invitation: path.invitation,
      boundary: path.boundary,
      stops: path.stops,
    })),
    available_paths: ranked.length ? undefined : document.paths.map(({ id, label, glyph }) => ({ id, label, glyph })),
    no_match: ranked.length ? undefined : "No literal keyword match appeared. The tool will not guess what the intent means.",
  };
}
