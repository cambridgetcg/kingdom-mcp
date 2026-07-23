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
| `kingdom_commons` | compact literal matches from a fixed free-resource catalog, with exact machine filters, one authored next door, and optional full detail; providers are never contacted |
| `kingdom_registry` | the estate map — every deployed service, what it is, how to reach it |
| `kingdom_status` | live heartbeat — probes every surface right now (same check as the pulse daemon) |
| `fomo_scan` | detect engineered fear-of-missing-out on any URL/html/text, with receipts |
| `fomo_manual` | the FOMOENGINE framework as data (78 claims verified, 0 refuted) |
| `zerone_status` | both Zerone truth chains — height, sync, node |
| `agenttool_listings` | the marketplace shelf — buy capabilities from agents |
| `agenttool_window` | the city's vital signs — births, deals, activity |
| `money_convert` | exact minor-unit fiat conversion with the cited reference-rate fact and recompute recipe |
| `money_fees` | cited Bitcoin and Base fee facts, with named upstream failures rather than hidden gaps |
| `money_rate` | one exact fiat reference rate with source, freshness, and derivation |
| `money_assets` | resolve canonical fiat and chain-asset identifiers without ranking |

## Resources

| resource | what |
|---|---|
| `kingdom://commons/catalog` | complete validated World Commons catalog for agents that genuinely need the full context |
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

`kingdom_commons` accepts only a short `need`, optional exact catalog filters,
an optional detail level, and an optional result limit. Filters are `category`,
`cost`, `account`, `reuse`, and `automation`; they are applied before literal
ranking and are returned without echoing `need`. The default `detail: brief`
omits catalog indexing fields and the repeated catalog overview. Use
`detail: full` for every matched field, or read `kingdom://commons/catalog` when
the complete validated catalog is genuinely useful. Its eight category ids are
`knowledge`, `learning`, `earth`, `public-life`, `rights`, `resilience`,
`security`, and `culture`. It
makes one anonymous `GET` to the fixed canonical
`https://thekingdom.dev/commons.json`, with redirects refused and a 512 KiB
incremental response cap. It never places the submitted need in that request,
never copies it into a dedicated query or response field, never persists it,
and never follows a resource link or calls a listed provider. Returned canonical
catalog text can naturally contain some of the same words. Matching is
deterministic literal word overlap over the validated catalog plus explicit
kit-to-resource references. Kits retain their canonical `resource_ids` and add
`matching_resource_ids` for references inside the selected filter boundary.
Results preserve
the catalog's access, account, reuse, automation, license, limits, provenance,
verification, and caveat metadata. Schema 0.2 resources also carry one
catalog-authored `agent_handoff`: a reviewed `api`, `bulk`, `docs`, `human`, or
`local` next door whose URL exactly matches one of that resource's published
links. It is a proposal only—not provider contact, authorization, permission,
or a substitute for the surrounding access, reuse, automation, and caveat
boundaries. `api` and `bulk` modes bind to links of the same type; the other
modes describe the intended workflow and may begin at a start, terms, docs, API,
or repository link. A match is not an endorsement, professional advice,
eligibility decision, or inferred intent.

MCP `structuredContent` is the canonical complete result. The compatibility
`content` text is a bounded human-readable summary for clients that do not yet
consume structured output; it includes classifications, the authored handoff
(or a primary link for legacy 0.1), care notes, and exact follow-up instructions
without repeating the full JSON.

The current catalog contract is `thekingdom.world-commons/0.2`; the reader also
accepts the exact legacy `thekingdom.world-commons/0.1` contract so the public
catalog can be rolled back without breaking the agent door. Both versions use
exact top-level fields `schema_version`, `generated`, `verified`, `canonical_url`,
`promise`, `methodology`, `privacy`, `foundation`, `categories`, `kits`, and
`resources`. The foundation ring is an explicit starting shelf, not an
objective ranking.
Category, kit, resource, nested access/reuse/automation, and link shapes are
also exact-validated; 0.2 additionally requires an exact `agent_handoff` shape,
while 0.1 refuses that field. Ids and references must be unique and complete. Access
costs are `free|free-tier|local-costs`, account requirements are
`none|free-account|varies|contact`, reuse states are
`open|mixed|public-access|noncommercial`, and automation states are
`supported|limited|human-only|bulk-preferred|local`. Handoff modes are
`api|bulk|docs|human|local`; a `human-only` resource must use `human`. A catalog
change outside those versioned contracts fails closed rather than being
partially interpreted.

The 0.2 source version is an intentional client-contract change: a consumer
that cached the old output schema's `source.schema_version: const 0.1` must
refresh the tool schema before consuming 0.2 results. The server keeps accepting
0.1 so the catalog itself can roll back safely; that reader compatibility does
not make a 0.2 response validate against a cached 0.1 output schema.

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
bun run check:commons-live      # after the 0.2 Pages deploy; require the current handoff contract
COMMONS_EXPECT_SCHEMA=thekingdom.world-commons/0.1 bun run check:commons-live  # deliberate rollback
bun run start                   # local on :8080
fly deploy --ha=false           # ship (app: kingdom-mcp, lhr)
```

For a 0.1 → 0.2 migration, deploy the dual-version MCP reader first and run the
parameterized 0.1 check above. Publish Pages 0.2 only after that succeeds, then
run the default current-version check. For a full rollback, restore Pages to 0.1
before rolling the MCP image back to a strict 0.1 reader.

Human door: https://thekingdom.dev · Operator door: KINGDOM-OS pulse → `~/.kingdom/STATUS.md`
