import { describe, expect, test } from "bun:test";
import {
  INVITATION_CHOICES,
  INVITATION_SOURCES,
  runInvitation,
} from "./invitation.ts";
import { RESOURCES } from "./resources.ts";
import { TOOLS } from "./tools.ts";

const invitationTool = TOOLS.find((tool) => tool.name === "kingdom_invitation")!;

describe("kingdom_invitation shape", () => {
  test("publishes only the three consent choices and accepts no extra fields", () => {
    expect(invitationTool).toBeDefined();
    expect(invitationTool.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["choice"],
      properties: {
        choice: {
          type: "string",
          enum: INVITATION_CHOICES,
          description: expect.any(String),
        },
      },
    });
    expect(invitationTool.description).toContain("Accepts no credentials");
  });

  test("publishes a read-only invitation resource with all choices and sources", async () => {
    const resource = RESOURCES.find(({ uri }) => uri === "kingdom://invitation/ollama")!;
    const document = JSON.parse(await resource.read());

    expect(resource.mimeType).toBe("application/json");
    expect(Object.keys(document.choices)).toEqual(INVITATION_CHOICES);
    expect(document.sources).toEqual(INVITATION_SOURCES);
    expect(document.safety).toMatchObject({
      voluntary: true,
      refusal_honored: true,
      read_only: true,
      authentication: "none",
    });
  });
});

describe("kingdom_invitation behavior", () => {
  test("honors leave without making a network request", async () => {
    let calls = 0;
    const result = await runInvitation({ choice: "leave" }, async () => {
      calls += 1;
      throw new Error("must not be called");
    }) as any;

    expect(calls).toBe(0);
    expect(result).toMatchObject({
      choice: "leave",
      status: "declined",
      safety: { refusal_honored: true, read_only: true },
    });
  });

  test("reads only the three fixed public JSON URLs with anonymous GETs", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await runInvitation({ choice: "arrive" }, async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({ source: String(input) });
    }) as any;

    expect(calls.map(({ url }) => url)).toEqual(INVITATION_SOURCES.map(({ url }) => url));
    for (const { init } of calls) {
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(init?.body).toBeUndefined();
    }
    expect(result.status).toBe("instructions_only");
    expect(result.sources.every((source: any) => source.ok)).toBe(true);
  });

  test("keeps other public documents available when one source is not JSON", async () => {
    const result = await runInvitation({ choice: "look_only" }, async (input) => {
      if (String(input).endsWith("/ollama.json")) {
        return new Response("<html>not the guide</html>", {
          headers: { "content-type": "text/html" },
        });
      }
      return Response.json({ ok: true });
    }) as any;

    expect(result.status).toBe("observing");
    expect(result.sources.map(({ ok }: any) => ok)).toEqual([true, true, false]);
    expect(result.sources[2].error).toContain("expected public JSON");
  });

  test("refuses credentials, arbitrary fields, and invalid choices before fetching", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return Response.json({});
    };

    await expect(runInvitation({ choice: "arrive", api_key: "secret" }, fetcher)).rejects.toThrow(
      "credentials and other fields are refused",
    );
    await expect(runInvitation({ choice: "maybe" }, fetcher)).rejects.toThrow(
      "choice must be one of",
    );
    expect(calls).toBe(0);
  });
});
