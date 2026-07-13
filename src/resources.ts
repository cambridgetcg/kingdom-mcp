import { INVITATION_RESOURCE_DOCUMENT } from "./invitation.ts";

export interface ResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => Promise<string> | string;
}

export const RESOURCES: ResourceDef[] = [
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
