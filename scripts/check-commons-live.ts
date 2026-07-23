#!/usr/bin/env bun
import {
  COMMONS_LEGACY_SCHEMA_VERSION,
  COMMONS_RESOURCE_URI,
  COMMONS_SCHEMA_VERSION,
  COMMONS_SCHEMA_VERSIONS,
  COMMONS_SOURCE_URL,
  runCommons,
} from "../src/commons.ts";

const expectedSchema = process.env.COMMONS_EXPECT_SCHEMA ?? COMMONS_SCHEMA_VERSION;
if (!COMMONS_SCHEMA_VERSIONS.includes(expectedSchema as typeof COMMONS_SCHEMA_VERSIONS[number])) {
  throw new Error(
    `COMMONS_EXPECT_SCHEMA must be ${COMMONS_LEGACY_SCHEMA_VERSION} or ${COMMONS_SCHEMA_VERSION}`,
  );
}

const result = await runCommons({
  need: "security vulnerability",
  category: "security",
  account: "none",
  automation: "bulk-preferred",
  limit: 1,
}) as any;

if (result?.detail !== "brief" ||
    result?.catalog_resource !== COMMONS_RESOURCE_URI ||
    result?.catalog !== undefined ||
    result?.filters?.category !== "security" ||
    result?.filters?.account !== "none" ||
    result?.filters?.automation !== "bulk-preferred" ||
    result?.source?.url !== COMMONS_SOURCE_URL ||
    result?.source?.canonical_url !== COMMONS_SOURCE_URL ||
    result?.source?.schema_version !== expectedSchema ||
    !Array.isArray(result?.matches) || !result.matches.length ||
    (expectedSchema === COMMONS_SCHEMA_VERSION && !result.matches[0]?.agent_handoff) ||
    (expectedSchema === COMMONS_LEGACY_SCHEMA_VERSION && result.matches[0]?.agent_handoff !== undefined) ||
    !Array.isArray(result?.matched_kits)) {
  throw new Error("live commons contract did not validate or return a bounded security match");
}
console.log(`live commons contract ready · ${result.source.verified} · ${result.matches[0].id}`);
