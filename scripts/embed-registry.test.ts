import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { embedRegistry, publicService } from "./embed-registry.ts";

// Synthetic display address and operator notes; never use a private registry.
const payTo = "11111111111111111111111111111111";
const price = "x402 LIVE 2026-07-19: /scan = $0.01 USDC on Solana mainnet";
const listing = "Plus fomo-scan listing 402e833c via seller-loop.";
const money = `${price} (PayAI facilitator, keychain item TEST_ONLY_OPERATOR_NOTE, payTo ${payTo}). ${listing}`;
const publicMoney = `${price}; PayAI facilitator; payTo ${payTo}; ${listing}`;

const directories: string[] = [];
const originalRegistry = process.env.KINGDOM_REGISTRY;

afterEach(() => {
  if (originalRegistry === undefined) delete process.env.KINGDOM_REGISTRY;
  else process.env.KINGDOM_REGISTRY = originalRegistry;
  for (const directory of directories.splice(0)) {
    for (const name of ["REGISTRY.yaml", "registry.json"]) {
      const path = join(directory, name);
      if (existsSync(path)) unlinkSync(path);
    }
    rmdirSync(directory);
  }
});

function fixturePaths() {
  const directory = mkdtempSync(join(tmpdir(), "kingdom-embed-"));
  directories.push(directory);
  return { source: join(directory, "REGISTRY.yaml"), output: join(directory, "registry.json") };
}

describe("public money curation", () => {
  test("keeps public x402 terms and payTo, never operator notes", () => {
    expect(publicService({ money }).money).toBe(publicMoney);
    const safe = publicService({ money: money.replace("keychain item", "internal custody instructions") });
    expect(safe.money).toBe(publicMoney);
    expect(JSON.stringify(safe)).not.toContain("TEST_ONLY_OPERATOR_NOTE");
  });

  test("preserves a shortened public payTo display without inventing an address", () => {
    expect(publicService({ money: money.replace(payTo, "CeQqNBX5…") }).money)
      .toBe(publicMoney.replace(payTo, "CeQqNBX5…"));
  });

  test("preserves the other reviewed public money descriptions", () => {
    for (const value of [
      "5% marketplace take; stripe wired; publishing a listing = 5 credits",
      "art data listing on agenttool (the first listing that ever earned)",
    ]) expect(publicService({ money: value }).money).toBe(value);
  });

  test("uses source values for reviewed terms and is stable when curated again", () => {
    const changed = money.replace("$0.01", "$0.25").replace("2026-07-19", "2026-10-19");
    const expected = publicMoney.replace("$0.01", "$0.25").replace("2026-07-19", "2026-10-19");
    const safe = publicService({ money: changed });
    expect(safe.money).toBe(expected);
    expect(publicService(safe).money).toBe(expected);
  });

  test("omits unknown money prose and non-string values rather than guessing", () => {
    for (const value of [undefined, null, 42, [], { notes: "TEST_ONLY_OPERATOR_NOTE" }, "", "operator procedure TEST_ONLY_OPERATOR_NOTE"])
      expect(publicService({ money: value }).money).toBeUndefined();
    expect(publicService({ money: "5% marketplace take; internal note TEST_ONLY_OPERATOR_NOTE" }).money)
      .toBe("5% marketplace take");
    expect(publicService({ money: `${price} (payTo TEST_ONLY_OPERATOR_NOTE)` }).money).toBe(price);
  });

  test("the committed snapshot the image serves is already curated", async () => {
    const snapshot = await Bun.file(new URL("../src/registry.gen.json", import.meta.url).pathname).json();
    for (const service of snapshot.services) expect(service.money).toBe(publicService(service).money);
  });
});

describe("explicit registry input", () => {
  test("writes only the public subset from an explicitly supplied fixture", async () => {
    const { source, output } = fixturePaths();
    await Bun.write(source, Bun.YAML.stringify({
      updated: "2026-10-19",
      services: [{
        id: "fixture", what: "synthetic service", status: "live", money,
        urls: { site: "https://example.com", private: "http://127.0.0.1:1234" },
        notes: "TEST_ONLY_OPERATOR_NOTE", deploy: "TEST_ONLY_OPERATOR_NOTE", repo: "TEST_ONLY_OPERATOR_NOTE",
      }],
    }));
    process.env.KINGDOM_REGISTRY = join(tmpdir(), "not-the-selected-registry.yaml");
    expect(await embedRegistry(source, output)).toBe(1);
    const text = await Bun.file(output).text();
    const result = JSON.parse(text);
    expect(result.updated).toBe("2026-10-19");
    expect(Number.isNaN(Date.parse(result.generated))).toBe(false);
    expect(result.services).toEqual([{
      id: "fixture", what: "synthetic service", status: "live", money: publicMoney,
      urls: { site: "https://example.com" },
    }]);
    expect(text).not.toContain("TEST_ONLY_OPERATOR_NOTE");
    expect(text).not.toContain("keychain");
  });

  test("resolves KINGDOM_REGISTRY at call time, not import time", async () => {
    const { source, output } = fixturePaths();
    await Bun.write(source, "updated: fixture\nservices: []\n");
    process.env.KINGDOM_REGISTRY = source;
    expect(await embedRegistry(undefined, output)).toBe(0);
    expect((await Bun.file(output).json()).updated).toBe("fixture");
  });

  test("missing or blank source fails before creating or replacing output", async () => {
    const { output } = fixturePaths();
    for (const value of [undefined, "", "  \t  "]) {
      if (value === undefined) delete process.env.KINGDOM_REGISTRY;
      else process.env.KINGDOM_REGISTRY = value;
      await expect(embedRegistry(undefined, output)).rejects.toThrow("KINGDOM_REGISTRY");
      expect(existsSync(output)).toBe(false);
    }
    await Bun.write(output, "unchanged sentinel");
    await expect(embedRegistry("", output)).rejects.toThrow("KINGDOM_REGISTRY");
    expect(await Bun.file(output).text()).toBe("unchanged sentinel");
  });

  test("unreadable source leaves the existing output unchanged", async () => {
    const { source, output } = fixturePaths();
    await Bun.write(output, "unchanged sentinel");
    await expect(embedRegistry(source, output)).rejects.toThrow();
    expect(await Bun.file(output).text()).toBe("unchanged sentinel");
  });
});
