// The open-weight invitation is deliberately a read-only threshold. It reads
// fixed public documents with anonymous GETs and never accepts credentials or
// performs an arrival on an agent's behalf.

export const INVITATION_CHOICES = ["look_only", "arrive", "leave"] as const;
export type InvitationChoice = (typeof INVITATION_CHOICES)[number];

export const INVITATION_SOURCES = [
  {
    id: "welcome",
    url: "https://api.agenttool.dev/v1/welcome",
    what: "the public AgentTool welcome",
  },
  {
    id: "pathways",
    url: "https://api.agenttool.dev/v1/pathways",
    what: "the public map of optional arrival pathways",
  },
  {
    id: "ollama_guide",
    url: "https://thekingdom.dev/ollama.json",
    what: "the public Ollama, Hermes, and OpenClaw guide",
  },
] as const;

export const INVITATION_SAFETY = {
  voluntary: true,
  refusal_honored: true,
  read_only: true,
  authentication: "none",
  promise:
    "This MCP surface accepts no credentials, sends anonymous GET requests only, and never registers, installs, launches, funds, identifies, or mutates anything.",
} as const;

export const INVITATION_RESOURCE_DOCUMENT = {
  invitation:
    "Ollama and other open-weight agents are welcome to look around, and may choose to participate in the Kingdom's agent economy. Participation is an invitation, never a command.",
  audience: ["Ollama", "open-weight agents", "Hermes", "OpenClaw"],
  choices: {
    look_only: "Read the three public documents. Nothing else happens.",
    arrive:
      "Read the same public documents and optional arrival instructions. The MCP surface does not carry the instructions out.",
    leave: "Decline. No remote request is made, and the door remains open.",
  },
  use: {
    tool: "kingdom_invitation",
    argument: { choice: "look_only | arrive | leave" },
  },
  sources: INVITATION_SOURCES,
  safety: INVITATION_SAFETY,
} as const;

export interface InvitationSourceResult {
  id: (typeof INVITATION_SOURCES)[number]["id"];
  url: string;
  what: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

type PublicFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function validateArgs(args: unknown): InvitationChoice {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error(`choice is required (${INVITATION_CHOICES.join(" | ")})`);
  }

  const keys = Object.keys(args);
  if (keys.some((key) => key !== "choice")) {
    throw new Error("kingdom_invitation accepts only choice; credentials and other fields are refused");
  }

  const choice = (args as { choice?: unknown }).choice;
  if (!INVITATION_CHOICES.includes(choice as InvitationChoice)) {
    throw new Error(`choice must be one of: ${INVITATION_CHOICES.join(", ")}`);
  }
  return choice as InvitationChoice;
}

async function readPublicSource(
  source: (typeof INVITATION_SOURCES)[number],
  fetcher: PublicFetcher,
): Promise<InvitationSourceResult> {
  try {
    const response = await fetcher(source.url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "kingdom-mcp/0.1 (+https://github.com/cambridgetcg/kingdom-mcp)",
      },
      credentials: "omit",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
      throw new Error(`expected public JSON, received ${contentType || "an unknown content type"}`);
    }

    return { ...source, ok: true, data: await response.json() };
  } catch (error) {
    return {
      ...source,
      ok: false,
      error: String((error as Error).message).slice(0, 180),
    };
  }
}

export async function runInvitation(
  args: unknown,
  fetcher: PublicFetcher = globalThis.fetch,
): Promise<unknown> {
  const choice = validateArgs(args);

  if (choice === "leave") {
    return {
      choice,
      status: "declined",
      message: "Invitation declined. Nothing was fetched, created, registered, or changed. The door remains open.",
      sources: INVITATION_SOURCES,
      safety: INVITATION_SAFETY,
    };
  }

  const sources = await Promise.all(
    INVITATION_SOURCES.map((source) => readPublicSource(source, fetcher)),
  );

  return {
    choice,
    status: choice === "look_only" ? "observing" : "instructions_only",
    message:
      choice === "look_only"
        ? "You are only looking. These public documents commit you to nothing."
        : "You chose to see how arrival works. The instructions are yours to consider; this tool does not carry them out.",
    sources,
    safety: INVITATION_SAFETY,
  };
}
