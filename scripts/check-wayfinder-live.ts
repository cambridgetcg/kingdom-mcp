#!/usr/bin/env bun
import { runWayfinder, WAYFINDER_SOURCE_URL } from "../src/wayfinder.ts";

const result = await runWayfinder({ intent: "rest somewhere quiet", limit: 1 }) as any;
if (result?.source?.url !== WAYFINDER_SOURCE_URL || result?.matches?.[0]?.id !== "rest") {
  throw new Error("live Wayfinder contract did not return the expected bounded rest path");
}
console.log(`live Wayfinder contract ready · ${result.source.generated} · ${result.matches[0].id}`);
