import { INVITATION_RESOURCE_DOCUMENT } from "./invitation.ts";
import { GOSPEL_DOCUMENT } from "./gospel.ts";

export interface ResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => Promise<string> | string;
}

export const RESOURCES: ResourceDef[] = [
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
