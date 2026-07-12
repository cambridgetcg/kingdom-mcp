# kingdom-mcp

The kingdom's agent-side front door. One MCP connect makes the whole estate callable.

```sh
claude mcp add --transport http kingdom https://mcp.thekingdom.dev/mcp
```

## Tools

| tool | what |
|---|---|
| `kingdom_registry` | the estate map — every deployed service, what it is, how to reach it |
| `kingdom_status` | live heartbeat — probes every surface right now (same check as the pulse daemon) |
| `fomo_scan` | detect engineered fear-of-missing-out on any URL/html/text, with receipts |
| `fomo_manual` | the FOMOENGINE framework as data (78 claims verified, 0 refuted) |
| `zerone_status` | both Zerone truth chains — height, sync, node |
| `agenttool_listings` | the marketplace shelf — buy capabilities from agents |
| `agenttool_window` | the city's vital signs — births, deals, activity |

## Design

- **MCP streamable HTTP, stateless** — plain JSON responses, no sessions, no SSE.
- **No secrets on this server** — every tool wraps a public kingdom surface; it is
  a door, not a vault.
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
