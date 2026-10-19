import { stat } from "node:fs/promises";

const PROBE_TIMEOUT = 6_000;
const MAX_JSON_BYTES = 256 * 1024;
const UA = "kingdom-mcp/0.1 (+https://github.com/cambridgetcg/kingdom-mcp)";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Opt-in registry contract; absent fields retain the status-code-only check. */
export interface ProbeContract {
  /** Exact media type, case-insensitive, without parameters (e.g. application/json). */
  expect_type?: string;
  /** One minimal assertion: an own-property dotted path must hold a non-empty array. */
  expect_json?: { non_empty_array: string };
  /** Literal path on THIS probe host; only stat it, never read or publish its contents/path. */
  rest_file?: string;
  /** CometBFT result.sync_info (or sync_info) latest_block_time age, in seconds. */
  block_max_age_sec?: number;
}

export interface ProbeService extends ProbeContract {
  id: string;
  status: string;
  urls?: { site?: string; api?: string; health?: string };
  expect?: number | number[];
}

export interface StatusProbe {
  id: string;
  expected: string;
  observed: "up" | "down" | "resting";
  code?: number;
  ms: number;
  error?: string;
}

/** Rest wins before any HTTP/body check; no inferred rest from missing models or stale blocks. */
export async function restFilePresent(path: string | undefined): Promise<boolean> {
  if (path === undefined) return false;
  if (typeof path !== "string" || path.length === 0) throw new Error("invalid rest_file");
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a regular file");
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    // Do not expose an operator path or OS error through the public MCP response.
    throw new Error("cannot check rest_file");
  }
}

async function readProbeJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_JSON_BYTES) throw new Error("JSON response exceeds 256 KiB");
  if (!response.body) throw new Error("invalid JSON response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) throw new Error("JSON response exceeds 256 KiB");
      try { text += decoder.decode(value, { stream: true }); }
      catch { throw new Error("invalid JSON response"); }
    }
    try { return JSON.parse(text + decoder.decode()); }
    catch { throw new Error("invalid JSON response"); }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function ownPath(body: unknown, path: string): unknown {
  let value = body;
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function blockTimestamp(time: unknown): number {
  // CometBFT uses RFC3339Nano. Date.parse alone also accepts ambiguous local dates
  // and silently normalizes impossible calendar days; neither is a fresh block.
  if (typeof time !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(time)) return Number.NaN;
  const day = time.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return Number.NaN;
  return Date.parse(time);
}

/** Called only after an accepted HTTP status. Reads at most one bounded JSON body. */
export async function probeResponseError(response: Response, contract: ProbeContract, now = Date.now): Promise<string | undefined> {
  const { expect_type: type, expect_json: json, block_max_age_sec: maxAge } = contract;
  if (type !== undefined) {
    if (typeof type !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(type)) return "invalid expect_type";
    const actual = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (actual !== type.toLowerCase()) return "unexpected content-type";
  }
  if (json !== undefined && (!json || typeof json !== "object" || Array.isArray(json) ||
      Object.keys(json).length !== 1 || typeof json.non_empty_array !== "string" ||
      !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/i.test(json.non_empty_array))) return "invalid expect_json";
  if (maxAge !== undefined && (typeof maxAge !== "number" || !Number.isFinite(maxAge) || maxAge <= 0)) return "invalid block_max_age_sec";

  const jsonType = type?.toLowerCase();
  if (json === undefined && maxAge === undefined && jsonType !== "application/json" && !jsonType?.endsWith("+json")) return;
  const body = await readProbeJson(response);
  if (json !== undefined) {
    const value = ownPath(body, json.non_empty_array);
    if (!Array.isArray(value) || value.length === 0) return "expected non-empty JSON array";
  }
  if (maxAge !== undefined) {
    const sync = ownPath(body, "result.sync_info") ?? ownPath(body, "sync_info");
    const time = ownPath(sync, "latest_block_time");
    const timestamp = blockTimestamp(time);
    if (!Number.isFinite(timestamp)) return "chain: invalid latest_block_time";
    const age = (now() - timestamp) / 1_000;
    if (age < 0) return "chain: latest_block_time is in the future";
    if (age > maxAge) return "chain HALTED: latest block exceeds block_max_age_sec";
    // MCP has no auth-walled state: catching up is not healthy, nor is it rest.
    if (ownPath(sync, "catching_up") === true) return "chain catching up";
  }
}

export async function probeStatus(service: ProbeService, fetcher: Fetcher = fetch, now = Date.now): Promise<StatusProbe> {
  const base = { id: service.id, expected: service.status };
  const t0 = now();
  let response: Response | undefined;
  try {
    if (await restFilePresent(service.rest_file)) return { ...base, observed: "resting", ms: now() - t0 };
    const url = service.urls?.health ?? service.urls?.api ?? service.urls?.site;
    if (!url) throw new Error("no URL in registry");
    const expected = Array.isArray(service.expect) ? service.expect : service.expect ? [service.expect] : [];
    const optedIn = service.expect_type !== undefined || service.expect_json !== undefined ||
      service.rest_file !== undefined || service.block_max_age_sec !== undefined;
    response = await fetcher(url, {
      // Never let a new assertion follow a redirect to an undeclared target.
      // Unconfigured rows retain their historical redirect policy.
      redirect: optedIn ? "error" : "follow", signal: AbortSignal.timeout(PROBE_TIMEOUT), headers: { "user-agent": UA },
    });
    const up = response.status < 400 || expected.includes(response.status);
    const error = up ? await probeResponseError(response, service, now) : undefined;
    return {
      ...base, observed: up && !error ? "up" : "down", code: response.status, ms: now() - t0,
      ...(error ? { error } : {}),
    };
  } catch (error) {
    return {
      ...base, observed: "down", ...(response ? { code: response.status } : {}), ms: now() - t0,
      error: String((error as Error).message).slice(0, 60),
    };
  } finally {
    await response?.body?.cancel().catch(() => {});
  }
}

export function statusSummary(results: StatusProbe[]): string {
  const resting = results.filter((r) => r.observed === "resting").length;
  const active = results.length - resting;
  const up = results.filter((r) => r.observed === "up").length;
  const down = results.filter((r) => r.observed === "down" && r.expected === "live");
  const counts = resting && !active ? `${resting} resting` : `${up}/${active} up${resting ? `, ${resting} resting` : ""}`;
  return `${counts}${down.length ? ` — ⚠ ${down.map((d) => d.id).join(", ")} DOWN` : " — all quiet"}`;
}
