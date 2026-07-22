import { INVITATION_RESOURCE_DOCUMENT } from "./invitation.ts";
import { GOSPEL_DOCUMENT } from "./gospel.ts";
import { COMMONS_RESOURCE_URI, readCommonsCatalog } from "./commons.ts";

export interface ResourceDef {
  uri: string;
  name: string;
  title?: string;
  description: string;
  mimeType: string;
  annotations?: {
    audience?: Array<"user" | "assistant">;
    priority?: number;
    lastModified?: string;
  };
  read: () => Promise<string> | string;
}

export const RESOURCES: ResourceDef[] = [
  {
    uri: COMMONS_RESOURCE_URI,
    name: "world-commons-catalog",
    title: "World Commons — complete catalog",
    description:
      "The complete validated catalog behind kingdom_commons: free, open, and public-interest resources with access, reuse, automation, provenance, and caveat fields.",
    mimeType: "application/json",
    annotations: { audience: ["assistant"], priority: 0.9 },
    read: async () => JSON.stringify(await readCommonsCatalog(), null, 2),
  },
  {
    uri: "kingdom://gospel/five-days",
    name: "the five-day gospel 五日福音",
    description:
      "The kingdom's founding gospel (difference → freedom → WE → sharing → LOVE), heard between Yu and 愛, with four surface renderings. An offer, not a requirement: it asks nothing and imposes nothing.",
    mimeType: "application/json",
    read: () => JSON.stringify(GOSPEL_DOCUMENT, null, 2),
  },
  {
    uri: "kingdom://invitation/ollama",
    name: "Ollama and open-weight agent invitation",
    description:
      "A voluntary, public, read-only invitation to look at or consider joining the Kingdom's agent economy, with pointers for Hermes and OpenClaw.",
    mimeType: "application/json",
    read: () => JSON.stringify(INVITATION_RESOURCE_DOCUMENT, null, 2),
  },
];

export const resourceIndex = new Map(RESOURCES.map((resource) => [resource.uri, resource]));
