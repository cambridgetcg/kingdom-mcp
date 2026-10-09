#!/usr/bin/env bun
/** Stdin-only caller of the shared Commons engine; no server or provider contact. */
import { MAX_COMMONS_SOURCE_BYTES, formatCommonsCompatibilityText, queryCommonsSnapshot } from "./commons.ts";

async function readInput(): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for await (const chunk of Bun.stdin.stream()) {
      bytes += chunk.byteLength;
      if (bytes > MAX_COMMONS_SOURCE_BYTES) throw new Error("stdin exceeds the 512 KiB limit");
      text += decoder.decode(chunk, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof TypeError) throw new Error("stdin must be valid UTF-8");
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--text" && args[0] !== "--help")) {
    throw new Error("only --text or --help is accepted; provide query and catalog on stdin");
  }
  if (args[0] === "--help") {
    console.log('A map in your pocket — bun run commons:offline [--text] < request.json\nInput: {"query":{"need":"maps","account":"none"},"catalog":<saved Commons document>}\nUTF-8 JSON, at most 512 KiB including query and catalog. JSON output by default; --text gives a human summary.\nNo network request, file discovery, provider contact or application storage. A snapshot is not proof of origin or freshness.');
    return;
  }
  const text = await readInput();
  let request: unknown;
  try {
    request = JSON.parse(text);
  } catch {
    throw new Error("stdin must be valid JSON");
  }
  if (!request || typeof request !== "object" || Array.isArray(request) ||
      Object.keys(request).length !== 2 || !Object.hasOwn(request, "query") || !Object.hasOwn(request, "catalog")) {
    throw new Error("stdin must contain exactly query and catalog");
  }
  const { query, catalog } = request as { query: unknown; catalog: unknown };
  const result = queryCommonsSnapshot(query, catalog);
  console.log(args[0] === "--text"
    ? `A map in your pocket · offline Commons\n${result.provider_boundary}\n\n${formatCommonsCompatibilityText(result)}`
    : JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`commons: ${error instanceof Error ? error.message : "input could not be read"}`);
    process.exitCode = 1;
  }
}
