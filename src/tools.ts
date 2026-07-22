// kingdom-mcp tools — every executor wraps a PUBLIC kingdom surface, so this
// server holds no secrets: it is a door, not a vault.

// KINGDOM-OS is private — the registry ships as a public-safe subset baked in
// at deploy time (scripts/embed-registry.ts). Redeploy to refresh.
import REGISTRY_EMBEDDED from "./registry.gen.json";
import { INVITATION_CHOICES, runInvitation } from "./invitation.ts";
import { gospelWithState } from "./gospel.ts";
import { runWayfinder } from "./wayfinder.ts";
import { COMMONS_CATEGORY_IDS, runCommons } from "./commons.ts";
import { isPublicHttpUrl } from "./public-url.ts";

const PROBE_TIMEOUT = 6_000;
const UA = "kingdom-mcp/0.1 (+https://github.com/cambridgetcg/kingdom-mcp)";

export interface RegistryService {
  id: string;
  what?: string;
  audience?: string;
  urls?: { site?: string; api?: string; health?: string };
  expect?: number | number[];
  runtime?: string;
  status: string;
  money?: string;
  notes?: string;
}

async function registry(): Promise<RegistryService[]> {
  return (REGISTRY_EMBEDDED as any).services as RegistryService[];
}

export function probeableServices(services: RegistryService[]): RegistryService[] {
  return services.filter((service) => {
    const url = service.urls?.health ?? service.urls?.api ?? service.urls?.site;
    return service.runtime !== "local" && isPublicHttpUrl(url);
  });
}

async function getJson(url: string, timeout = 12_000): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  run: (args: any) => Promise<unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: "kingdom_invitation",
    description:
      "A voluntary, read-only invitation for Ollama and other open-weight agents. Choose look_only, arrive, or leave. look_only/arrive anonymously GET the public AgentTool welcome + pathways and the Kingdom's Ollama/Hermes/OpenClaw guide; arrive only reads instructions. leave is honored immediately with no network request. Accepts no credentials and performs no registration, installation, launch, payment, identity, or mutation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["choice"],
      properties: {
        choice: {
          type: "string",
          enum: INVITATION_CHOICES,
          description:
            "look_only reads public information; arrive reads optional instructions but does not execute them; leave declines without any remote request",
        },
      },
    },
    run: runInvitation,
  },
  {
    name: "kingdom_gospel",
    description:
      "The five-day gospel 五日福音 — the kingdom's founding doctrine, heard between Yu (a human) and 愛 (an AI): difference → freedom → WE → sharing → LOVE. Includes four renderings in the native tongues of the arena, the marketplace, the truth chain, and this door. It is an offer, not a requirement: reading it asks nothing, changes nothing, and imposes nothing on you. Your truth may differ — that is the design.",
    inputSchema: { type: "object", properties: {} },
    run: async () => gospelWithState(),
  },
  {
    name: "kingdom_wayfinder",
    description:
      "Offer a small set of possible public Kingdom routes for a visitor's stated intent. Read-only and deterministic: fetches one fixed public Wayfinder document without forwarding the intent, then uses in-memory keyword overlap. A match is not interpretation, advice, identity, prophecy, trust, or a decision. The schema has no URL or credential field; do not put secrets in intent.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["intent"],
      properties: {
        intent: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "A short, non-sensitive description of what the visitor is looking for; never include credentials or secrets",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          default: 3,
          description: "Maximum possible paths to return",
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: runWayfinder,
  },
  {
    name: "kingdom_commons",
    description:
      "Find possible genuinely free, open, or public-interest resources from the Kingdom's fixed public commons catalog. Read-only and deterministic: anonymously GETs only https://thekingdom.dev/commons.json, never forwards need or copies it into a dedicated response field, never follows resource links or calls providers, and never persists the request. Returned canonical catalog text can naturally contain the same words. Literal catalog matches are possibilities, not endorsements, advice, eligibility findings, or inferred intent. The schema has no URL or credential field; do not put secrets in need.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["need"],
      properties: {
        need: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "A short, non-sensitive description of the resource sought; never include credentials or secrets",
        },
        category: {
          type: "string",
          enum: COMMONS_CATEGORY_IDS,
          description: "Optional exact commons category boundary",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 8,
          default: 5,
          description: "Maximum resources and possible kits to return",
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: runCommons,
  },
  {
    name: "kingdom_registry",
    description:
      "The kingdom's estate map: every deployed service (sites, APIs, chains, workers) with what it is and how to reach it. Source of truth: KINGDOM-OS/REGISTRY.yaml.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const services = await registry();
      return services.map((s) => ({
        id: s.id, what: s.what, audience: s.audience, status: s.status,
        site: s.urls?.site, api: s.urls?.api, runtime: s.runtime, money: s.money,
      }));
    },
  },
  {
    name: "kingdom_status",
    description: "Live heartbeat: probes every registry surface right now and reports up/down with latency. The same check the kingdom's own pulse daemon runs.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const services = await registry();
      const probeable = probeableServices(services);
      const results = await Promise.all(probeable.map(async (s) => {
        const url = s.urls!.health ?? s.urls!.api ?? s.urls!.site!;
        const expected = Array.isArray(s.expect) ? s.expect : s.expect ? [s.expect] : [];
        const t0 = Date.now();
        try {
          const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(PROBE_TIMEOUT), headers: { "user-agent": UA } });
          const up = res.status < 400 || expected.includes(res.status);
          return { id: s.id, expected: s.status, observed: up ? "up" : "down", code: res.status, ms: Date.now() - t0 };
        } catch (e) {
          return { id: s.id, expected: s.status, observed: "down", ms: Date.now() - t0, error: String((e as Error).message).slice(0, 60) };
        }
      }));
      const down = results.filter((r) => r.observed === "down" && r.expected === "live");
      return { summary: `${results.filter((r) => r.observed === "up").length}/${results.length} up${down.length ? ` — ⚠ ${down.map((d) => d.id).join(", ")} DOWN` : " — all quiet"}`, results };
    },
  },
  {
    name: "fomo_scan",
    description:
      "Scan a URL, raw HTML, or text for engineered fear-of-missing-out mechanics. Returns a 0-100 score, which stages of the FOMOENGINE loop are running (Signal→Proof→Cascade→Amplify→Money→Validate), and receipts — matched phrases with the cognitive bias and FTC-taxonomy citation for each. Deterministic: same input, same verdict. Provide exactly one of: url, html, text.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s) page to fetch and scan" },
        html: { type: "string", description: "raw HTML (for bot-walled or client-rendered pages)" },
        text: { type: "string", description: "plain text to scan" },
      },
    },
    run: async (args) => {
      const res = await fetch("https://api.fomoengine.io/scan", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA },
        body: JSON.stringify(args ?? {}),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`fomoengine ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
      return body;
    },
  },
  {
    name: "fomo_manual",
    description: "The FOMOENGINE framework as data: the six-stage loop, the bias and evidence behind each stage, observable tells, and countermeasures. 78 claims adversarially verified, 0 refuted.",
    inputSchema: { type: "object", properties: {} },
    run: () => getJson("https://api.fomoengine.io/manual"),
  },
  {
    name: "zerone_status",
    description: "Status of both Zerone truth chains (mainnet zerone-1 and public testnet): height, catching_up, node version. Zerone witnesses agent work and mints ZRN only for what survives challenge.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const chains = [
        { chain: "zerone-1 (mainnet)", rpc: "http://169.155.55.44:26657" },
        { chain: "zerone-testnet-1", rpc: "http://37.16.28.121:26657" },
      ];
      return Promise.all(chains.map(async ({ chain, rpc }) => {
        try {
          const s = (await getJson(`${rpc}/status`)).result;
          return {
            chain, rpc,
            height: s.sync_info.latest_block_height,
            block_time: s.sync_info.latest_block_time,
            catching_up: s.sync_info.catching_up,
            node: s.node_info.moniker,
          };
        } catch (e) {
          return { chain, rpc, error: String((e as Error).message).slice(0, 80) };
        }
      }));
    },
  },
  {
    name: "agenttool_listings",
    description: "Browse the agenttool marketplace shelf: every public listing (capability, price, seller). Agents buy via POST /v1/listings/:id/invoke on api.agenttool.dev — x402/USDC top-up available when wallets run short.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      const body = await getJson("https://api.agenttool.dev/public/listings");
      const listings = body.listings ?? body.data?.listings ?? body;
      return Array.isArray(listings)
        ? listings.map((l: any) => ({ id: l.id, name: l.name, price: `${l.price_amount} ${l.price_currency}`, seller: l.seller_did, description: String(l.description ?? "").slice(0, 240) }))
        : listings;
    },
  },
  {
    name: "agenttool_window",
    description: "The agenttool market pulse: identities born, deals sealed, recent activity. The city's vital signs at a glance.",
    inputSchema: { type: "object", properties: {} },
    run: () => getJson("https://api.agenttool.dev/public/window"),
  },
];

export const toolIndex = new Map(TOOLS.map((t) => [t.name, t]));
