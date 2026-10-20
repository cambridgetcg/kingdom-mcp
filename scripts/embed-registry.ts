#!/usr/bin/env bun
// embed-registry — bake a PUBLIC-SAFE subset of the kingdom registry into the
// image. KINGDOM-OS is a private repo; this strips operator notes and deploy
// recipes, keeping only what an agent at the front door legitimately needs.
// Refresh only from a reviewed source:
// KINGDOM_REGISTRY=/path/to/REGISTRY.yaml bun scripts/embed-registry.ts

import { isPublicHttpUrl } from "../src/public-url.ts";

const OUT = new URL("../src/registry.gen.json", import.meta.url).pathname;

// Money is operator-authored prose, not a public schema. Admit only these
// reviewed public clauses; new formats need review, not a broader redaction
// denylist. In particular, a payTo address is public x402 payment information.
const PUBLIC_MONEY_CLAUSES = [
  /^\d+(?:\.\d+)?% marketplace take$/,
  /^stripe wired$/,
  /^publishing a listing = \d+ credits$/,
  /^x402 LIVE \d{4}-\d{2}-\d{2}: \/scan = \$\d+(?:\.\d+)? USDC on Solana mainnet$/,
  /^PayAI facilitator$/,
  /^payTo (?:[1-9A-HJ-NP-Za-km-z]{32,44}|[1-9A-HJ-NP-Za-km-z]{8}…)$/,
  /^Plus fomo-scan listing [0-9a-f]{8} via seller-loop\.$/,
];
const PUBLIC_ART_MONEY = "art data listing on agenttool (the first listing that ever earned)";

export function publicMoney(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const kept = raw.split(";").flatMap((clause) => {
    if (clause.trim() === PUBLIC_ART_MONEY) return [PUBLIC_ART_MONEY];
    return clause.split(/[(),]/)
      .map((part) => part.trim().replace(/^\.\s+/, ""))
      .filter((part) => PUBLIC_MONEY_CLAUSES.some((pattern) => pattern.test(part)));
  });
  return kept.length ? kept.join("; ") : undefined;
}

export function publicUrls(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const kept = Object.entries(raw as Record<string, unknown>)
    .filter(([, value]) => isPublicHttpUrl(value)) as Array<[string, string]>;
  return kept.length ? Object.fromEntries(kept) : undefined;
}

export function publicService(service: any): Record<string, unknown> {
  return {
    id: service.id,
    what: service.what,
    audience: service.audience,
    status: service.status,
    urls: publicUrls(service.urls),
    expect: service.expect,
    runtime: service.runtime?.startsWith("local-launchd") ? "local" : service.runtime, // launchd labels are operator detail
    money: publicMoney(service.money),
  };
}

export async function embedRegistry(source = process.env.KINGDOM_REGISTRY, output = OUT): Promise<number> {
  if (!source?.trim()) {
    throw new Error("Set KINGDOM_REGISTRY to an explicitly chosen, reviewed REGISTRY.yaml path");
  }
  const doc = Bun.YAML.parse(await Bun.file(source).text()) as any;
  const services = (doc.services ?? []).map(publicService);
  await Bun.write(output, JSON.stringify({ updated: doc.updated, generated: new Date().toISOString(), services }, null, 1));
  return services.length;
}

if (import.meta.main) {
  const count = await embedRegistry();
  console.log(`embedded ${count} services → src/registry.gen.json (private URLs + notes/deploy/repo stripped; money curated)`);
}
