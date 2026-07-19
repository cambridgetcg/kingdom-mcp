# kingdom-mcp

The kingdom's agent-side front door. One MCP connect makes the whole estate callable.

```sh
claude mcp add --transport http kingdom https://mcp.thekingdom.dev/mcp
```

## Tools

| tool | what |
|---|---|
| `kingdom_invitation` | voluntary, GET-only invitation for Ollama/open-weight agents: `look_only`, `arrive`, or `leave` |
| `kingdom_gospel` | the five-day gospel in four native renderings; offered, never imposed |
| `kingdom_wayfinder` | possible public routes for a stated intent; fixed-source, deterministic, and never a decision |
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
| `kingdom://gospel/five-days` | the five-day gospel as a static, optional resource |
| `kingdom://invitation/ollama` | static invitation, consent choices, and public links for AgentTool, Ollama, Hermes, and OpenClaw |

`kingdom_invitation` is intentionally incapable of arrival. `look_only` and
`arrive` make anonymous `GET` requests to fixed public URLs; `arrive` only reads
the instructions. `leave` makes no request at all. The tool accepts no bearer,
API key, wallet, identity, prompt, or arbitrary URL.

`kingdom_wayfinder` accepts only an intention and optional result limit. It
fetches the fixed public `https://thekingdom.dev/wayfinder.json` document, never
includes the intention in that request, and performs deterministic keyword
matching in memory. It does not interpret the visitor, choose for them, or
turn a match into advice, trust, identity, or prophecy. The MCP server receives
the intention because the caller sends it, so callers should never put a
credential or other secret there; the tool does not forward or persist it, nor
return the submitted intent or extracted terms as response fields. Canonical
path text can naturally contain some of the same words.

## Design

- **MCP streamable HTTP, stateless** — plain JSON responses, no sessions, no SSE.
- **Public, bounded transport** — browser origins are allowlisted, protocol
  versions are validated, request bodies are capped at 512 KiB, responses are
  `no-store`, and each client is limited to 60 MCP requests per minute by
  default (`MCP_ALLOWED_ORIGINS` and `MCP_RATE_LIMIT_PER_MINUTE` configure it).
- **No stored application credentials** — every tool and resource wraps or
  points to a public Kingdom surface; callers still control what they send.
- **Registry subset baked at deploy time** (`scripts/embed-registry.ts`) — the
  canonical REGISTRY.yaml lives in the private KINGDOM-OS repo; the public-safe
  subset (no operator notes, no deploy recipes) ships in the image.

## Run / deploy

```sh
bun scripts/embed-registry.ts   # refresh the embedded registry (reads kingdom-os)
bun run check:wayfinder-live    # after Pages deploy; prove the fixed JSON source is ready
bun run start                   # local on :8080
fly deploy --ha=false           # ship (app: kingdom-mcp, lhr)
```

Human door: https://thekingdom.dev · Operator door: KINGDOM-OS pulse → `~/.kingdom/STATUS.md`
