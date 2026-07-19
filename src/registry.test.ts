import { describe, expect, test } from "bun:test";
import EMBEDDED from "./registry.gen.json";
import { probeableServices, type RegistryService } from "./tools.ts";
import { publicService, publicUrls } from "../scripts/embed-registry.ts";

describe("the public-safe registry boundary", () => {
  test("strips loopback, private-network, local-DNS, credentialed, and malformed URLs", () => {
    expect(publicUrls({
      site: "https://thekingdom.dev",
      loopback: "http://127.0.0.1:11434/api/tags",
      localhost: "http://localhost:8080",
      private10: "http://10.0.0.4",
      private172: "http://172.20.1.2",
      private192: "http://192.168.1.2",
      linklocal: "http://169.254.1.2",
      mdns: "http://ollama.local:11434",
      credentialed: "https://user:secret@example.com",
      malformed: "not a URL",
    })).toEqual({ site: "https://thekingdom.dev" });
  });

  test("publishes only the declared public-safe service subset", () => {
    const safe = publicService({
      id: "local-brain",
      what: "local Ollama",
      audience: "operator",
      status: "live",
      urls: { health: "http://127.0.0.1:11434/api/tags" },
      runtime: "local-launchd:com.ollama",
      repo: "private/repo",
      notes: "operator secret",
      deploy: "do private things",
    });
    expect(safe).toEqual({
      id: "local-brain",
      what: "local Ollama",
      audience: "operator",
      status: "live",
      urls: undefined,
      expect: undefined,
      runtime: "local",
      money: undefined,
    });
    expect(safe).not.toHaveProperty("repo");
    expect(safe).not.toHaveProperty("notes");
    expect(safe).not.toHaveProperty("deploy");
  });

  test("the committed embed contains no local-brain URL", () => {
    const localBrain = (EMBEDDED.services as any[]).find(({ id }) => id === "local-brain");
    expect(localBrain).toMatchObject({ id: "local-brain", runtime: "local" });
    expect(localBrain.urls).toBeUndefined();
  });
});

describe("kingdom_status probe selection", () => {
  test("defensively skips local runtimes even if an old embed still carries a URL", () => {
    const services: RegistryService[] = [
      { id: "local", status: "live", runtime: "local", urls: { health: "http://127.0.0.1:11434" } },
      { id: "public", status: "live", runtime: "fly:public", urls: { health: "https://example.com/health" } },
      { id: "record-only", status: "live", runtime: "fly:record-only" },
    ];
    expect(probeableServices(services).map(({ id }) => id)).toEqual(["public"]);
  });
});
