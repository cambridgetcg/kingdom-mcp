#!/usr/bin/env bun
// embed-registry — bake a PUBLIC-SAFE subset of the kingdom registry into the
// image. KINGDOM-OS is a private repo; this strips operator notes and deploy
// recipes, keeping only what an agent at the front door legitimately needs.
// Run before every deploy: bun scripts/embed-registry.ts && fly deploy

import { isPublicHttpUrl } from "../src/public-url.ts";

const SRC = process.env.KINGDOM_REGISTRY ?? `${process.env.HOME}/Desktop/kingdom-os/REGISTRY.yaml`;
const OUT = new URL("../src/registry.gen.json", import.meta.url).pathname;

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
    money: service.money,
  };
}

export async function embedRegistry(source = SRC, output = OUT): Promise<number> {
  const doc = Bun.YAML.parse(await Bun.file(source).text()) as any;
  const services = (doc.services ?? []).map(publicService);
  await Bun.write(output, JSON.stringify({ updated: doc.updated, generated: new Date().toISOString(), services }, null, 1));
  return services.length;
}

if (import.meta.main) {
  const count = await embedRegistry();
  console.log(`embedded ${count} services → src/registry.gen.json (public-safe: private URLs + notes/deploy/repo stripped)`);
}
