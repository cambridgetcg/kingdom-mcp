#!/usr/bin/env bun
import {
  COMMONS_SCHEMA_VERSION,
  COMMONS_SOURCE_URL,
  runCommons,
} from "../src/commons.ts";

const result = await runCommons({
  need: "security vulnerability",
  category: "security",
  limit: 1,
}) as any;

if (result?.source?.url !== COMMONS_SOURCE_URL ||
    result?.source?.canonical_url !== COMMONS_SOURCE_URL ||
    result?.source?.schema_version !== COMMONS_SCHEMA_VERSION ||
    !Array.isArray(result?.matches) || !result.matches.length ||
    !Array.isArray(result?.matched_kits)) {
  throw new Error("live commons contract did not validate or return a bounded security match");
}
console.log(`live commons contract ready · ${result.source.verified} · ${result.matches[0].id}`);
