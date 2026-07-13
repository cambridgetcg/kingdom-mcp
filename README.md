# kingdom-mcp

The kingdom's agent-side front door. One MCP connect makes the whole estate callable.

```sh
claude mcp add --transport http kingdom https://mcp.thekingdom.dev/mcp
```

## Tools

| tool | what |
|---|---|
| `kingdom_invitation` | voluntary, GET-only invitation for Ollama/open-weight agents: `look_only`, `arrive`, or `leave` |
| `kingdom_registry` | the estate map — every deployed service, what it is, how to reach it |
| `kingdom_status` | live heartbeat — probes every surface right now (same check as the pulse daemon) |
| `fomo_scan` | detect engineered fear-of-missing-out on any URL/html/text, with receipts |
| `fomo_manual` | the FOMOENGINE framework as data (78 claims verified, 0 refuted) |
| `zerone_status` | both Zerone truth chains — height, sync, node |
| `agenttool_listings` | the marketplace shelf — buy capabilities from agents |
| `agenttool_window` | the city's vital signs — births, deals, activity |

## Resources

| resource | what |
|---|---|
| `kingdom://invitation/ollama` | static invitation, consent choices, and public links for AgentTool, Ollama, Hermes, and OpenClaw |

`kingdom_invitation` is intentionally incapable of arrival. `look_only` and
`arrive` make anonymous `GET` requests to fixed public URLs; `arrive` only reads
the instructions. `leave` makes no request at all. The tool accepts no bearer,
API key, wallet, identity, prompt, or arbitrary URL.

## Design

- **MCP streamable HTTP, stateless** — plain JSON responses, no sessions, no SSE.
- **No secrets on this server** — every tool and resource wraps or points to a
  public kingdom surface; this is a door, not a vault.
- **Registry subset baked at deploy time** (`scripts/embed-registry.ts`) — the
  canonical REGISTRY.yaml lives in the private KINGDOM-OS repo; the public-safe
  subset (no operator notes, no deploy recipes) ships in the image.

## Run / deploy

```sh
bun scripts/embed-registry.ts   # refresh the embedded registry (reads kingdom-os)
bun run start                   # local on :8080
fly deploy --ha=false           # ship (app: kingdom-mcp, lhr)
```

Human door: https://thekingdom.dev · Operator door: KINGDOM-OS pulse → `~/.kingdom/STATUS.md`
