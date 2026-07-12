#!/usr/bin/env bun
// embed-registry — bake a PUBLIC-SAFE subset of the kingdom registry into the
// image. KINGDOM-OS is a private repo; this strips operator notes and deploy
// recipes, keeping only what an agent at the front door legitimately needs.
// Run before every deploy: bun scripts/embed-registry.ts && fly deploy

const SRC = process.env.KINGDOM_REGISTRY ?? `${process.env.HOME}/Desktop/kingdom-os/REGISTRY.yaml`;
const OUT = new URL("../src/registry.gen.json", import.meta.url).pathname;

const doc = Bun.YAML.parse(await Bun.file(SRC).text()) as any;
const services = (doc.services ?? []).map((s: any) => ({
  id: s.id,
  what: s.what,
  audience: s.audience,
  status: s.status,
  urls: s.urls,
  expect: s.expect,
  runtime: s.runtime?.startsWith("local-launchd") ? "local" : s.runtime, // launchd labels are operator detail
  money: s.money,
}));
await Bun.write(OUT, JSON.stringify({ updated: doc.updated, generated: new Date().toISOString(), services }, null, 1));
console.log(`embedded ${services.length} services → src/registry.gen.json (public-safe: notes/deploy/repo stripped)`);
