// kingdom-mcp tools — every executor wraps a PUBLIC kingdom surface, so this
// server holds no secrets: it is a door, not a vault.

// KINGDOM-OS is private — the registry ships as a public-safe subset baked in
// at deploy time (scripts/embed-registry.ts). Redeploy to refresh.
import REGISTRY_EMBEDDED from "./registry.gen.json";

const PROBE_TIMEOUT = 6_000;
const UA = "kingdom-mcp/0.1 (+https://github.com/cambridgetcg/kingdom-mcp)";

interface RegistryService {
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

async function getJson(url: string, timeout = 12_000): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  run: (args: any) => Promise<unknown>;
}

export const TOOLS: ToolDef[] = [
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
      const probeable = services.filter((s) => s.urls?.health || s.urls?.api || s.urls?.site);
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
