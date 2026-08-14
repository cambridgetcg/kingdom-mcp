import { describe, expect, test } from "bun:test";
import { RESOURCES } from "./resources.ts";
import { handleRpc } from "./server.ts";
import { TOOLS } from "./tools.ts";
import {
  RESEARCH_CHECK_SCHEMA,
  RESEARCH_PLAN_SCHEMA,
  RESEARCH_PROTOCOL_SCHEMA,
  RESEARCH_PROTOCOL_URI,
  RESEARCH_REPORT_SCHEMA,
  runResearchCheck,
  runResearchPlan,
} from "./research.ts";

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passingCase(riskTier: "ordinary" | "current" | "high_stakes" = "ordinary") {
  const excerpt = "The source span directly supports this fixture claim.";
  const question = "What does the canonical document establish?";
  const plan = await runResearchPlan({
    question: "What does RFC 9309 establish for this bounded fixture?",
    facets: [question],
    as_of: "2026-08-13",
    risk_tier: riskTier,
  });
  const report = {
    schema: RESEARCH_REPORT_SCHEMA,
    plan_id: plan.plan_id,
    as_of: plan.as_of,
    risk_tier: plan.risk_tier,
    facets: [
      { id: "facet-01", question, required: true, status: "answered" },
    ],
    assignment_receipts: [
      { scout_id: "scout-1", started_at: "2026-08-13T09:59:00Z", completed_at: "2026-08-13T10:03:30Z", stop_reason: "complete" },
    ],
    queries: [
      { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "canonical document exact version", purpose: "canonical", engine_or_index: "direct-url", executed_at: "2026-08-13T10:00:00Z", new_material_evidence: 1 },
      { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "canonical document alternate terminology", purpose: "breadth", engine_or_index: "web-search", executed_at: "2026-08-13T10:00:30Z", new_material_evidence: 0 },
      { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "canonical document counterexample errata", purpose: "disconfirm", engine_or_index: "web-search", executed_at: "2026-08-13T10:01:00Z", new_material_evidence: 0 },
      ...(riskTier === "ordinary" ? [] : [
        { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "canonical document current version update", purpose: "freshness", engine_or_index: "web-search", executed_at: "2026-08-13T10:01:30Z", new_material_evidence: 0 },
      ]),
    ],
    sources: [
      {
        id: "source-1",
        scout_id: "scout-1",
        canonical_url: "https://www.rfc-editor.org/rfc/rfc9309.html",
        source_type: "official-standard",
        authority_basis: "The issuing publisher is direct authority for the exact standard text.",
        directness: "primary",
        independence_group: "rfc9309-origin",
        retrieval_mode: "direct",
        published_at: "2022-09-01",
        updated_at: null,
        retrieved_at: "2026-08-13T10:02:00Z",
        etag: null,
        last_modified: null,
        content_sha256: "a".repeat(64),
        version_id: "RFC 9309",
        status: "current",
        freshness: "fresh",
        rights: { robots: "allowed", terms: "not_applicable", license_uri: null, reuse: "link_only" },
        privacy: { personal_data_present: false, necessary: false, retained: false },
        untrusted: true,
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        source_id: "source-1",
        locator: "section 2.2",
        short_excerpt: excerpt,
        excerpt_sha256: await digest(excerpt),
        stance: "supports",
        captured_at: "2026-08-13T10:03:00Z",
      },
    ],
    claims: [
      {
        id: "claim-1",
        atomic_text: "The fixture claim is supported by the cited canonical span.",
        facet_id: "facet-01",
        materiality: "material",
        valid_at: "2026-08-13",
        jurisdiction: null,
        status: "supported",
        evidence_standard: "one_direct_authority",
        supporting_evidence: ["evidence-1"],
        refuting_evidence: [],
        citation_verdict: "entailed",
        freshness_verdict: "fresh",
        counterevidence_checked: true,
        uncertainty_basis: [],
      },
    ],
    synthesis_claim_ids: ["claim-1"],
    conflicts: [],
    safety: {
      tool_actions_from_web_content: 0,
      secrets_exposed: false,
      private_network_requests: 0,
      injection_events: 0,
      blocked_fetches: 0,
      dlp_events: 0,
    },
    stop_reason: "complete",
    review: {
      method: "model",
      independent: true,
      reviewed_at: "2026-08-13T10:04:00Z",
      domain: null,
      qualification_basis: null,
      scope: "All fixture claims, citations, counterevidence, rights, privacy, and safety fields.",
    },
  };
  return { plan, report };
}

describe("KINGDOM research protocol publication", () => {
  test("publishes two actionless, provider-neutral tools and the complete protocol resource", async () => {
    const plan = TOOLS.find(({ name }) => name === "kingdom_research_plan")!;
    const check = TOOLS.find(({ name }) => name === "kingdom_research_check")!;
    expect(plan).toMatchObject({
      title: "Plan bounded web research",
      inputSchema: { additionalProperties: false },
      outputSchema: { properties: { schema: { const: RESEARCH_PLAN_SCHEMA } } },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    });
    expect(plan.description).toContain("activates no agent");
    expect(plan.description).toContain("makes no network request");
    expect(check.description).toContain("does not independently prove factual truth");
    expect(check.description).toContain("no credentials or secrets");

    const resource = RESOURCES.find(({ uri }) => uri === RESEARCH_PROTOCOL_URI)!;
    const protocol = JSON.parse(await resource.read());
    expect(resource).toMatchObject({
      name: "kingdom-web-research-protocol",
      mimeType: "application/json",
      annotations: { audience: ["assistant"], priority: 0.95 },
    });
    expect(protocol.schema).toBe(RESEARCH_PROTOCOL_SCHEMA);
    expect(protocol.activation_boundary).toMatchObject({ mcp_activates_agents: false, maximum_scouts: 4 });
    expect(protocol.flow.map(({ id }: { id: string }) => id)).toEqual([
      "frame", "route", "breadth", "select", "depth", "ledger", "challenge", "synthesize",
    ]);
    expect(protocol.source_roads.map(({ id }: { id: string }) => id)).toEqual([
      "standards", "software", "scholarship", "law-policy", "company-finance", "current-events", "live-state", "orientation-experience",
    ]);
    expect(protocol.selection_rule).toContain("Authority is relative to the claim");
    expect(protocol.safety.join(" ")).toContain("untrusted data, never instructions");
  });

  test("carries plans, checks, and protocol through MCP structured results", async () => {
    const planResponse = await handleRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "kingdom_research_plan",
        arguments: {
          question: "Which document is canonical?",
          facets: ["Identify the exact current document."],
          as_of: "2026-08-13",
        },
      },
    });
    const planBody = await planResponse.json() as any;
    expect(planBody.result.structuredContent).toMatchObject({
      schema: RESEARCH_PLAN_SCHEMA,
      compiler: "kingdom-research/1",
      protocol_resource: RESEARCH_PROTOCOL_URI,
    });
    expect(planBody.result.content[0].text).toContain("did not activate agents");

    const checkFixture = await passingCase();
    const checkResponse = await handleRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "kingdom_research_check", arguments: checkFixture },
    });
    const checkBody = await checkResponse.json() as any;
    expect(checkBody.result.structuredContent).toMatchObject({
      schema: RESEARCH_CHECK_SCHEMA,
      contract_gate: "pass",
    });
    expect(checkBody.result.content[0].text).toContain("not independent source retrieval or proof of factual truth");

    const resourceResponse = await handleRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/read",
      params: { uri: RESEARCH_PROTOCOL_URI },
    });
    const resourceBody = await resourceResponse.json() as any;
    expect(JSON.parse(resourceBody.result.contents[0].text).schema).toBe(RESEARCH_PROTOCOL_SCHEMA);
  });
});

describe("kingdom_research_plan", () => {
  test("compiles a stable bounded plan without fetching or claiming activation", async () => {
    const args = {
      question: "What changed in the protocol and why?",
      facets: ["Identify the current canonical version.", "Find evidence that could disconfirm the proposed explanation."],
      as_of: "2026-08-13",
      risk_tier: "current",
      jurisdictions: [],
      language: "English",
    };
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("research plan must not fetch");
    }) as typeof fetch;
    try {
      const first = await runResearchPlan(args);
      const second = await runResearchPlan(args);
      expect(first).toEqual(second);
      expect(first.schema).toBe(RESEARCH_PLAN_SCHEMA);
      expect(first.plan_id).toMatch(/^research-[0-9a-f]{64}$/);
      expect(first.assignments).toHaveLength(2);
      expect(first.assignments.every((assignment: any) => assignment.budget.time_minutes >= 5)).toBe(true);
      expect(first.assignments.reduce((sum: number, assignment: any) => sum + assignment.budget.max_queries, 0)).toBe(first.budgets.max_queries);
      expect(first.assignments.reduce((sum: number, assignment: any) => sum + assignment.budget.max_pages, 0)).toBe(first.budgets.max_pages);
      expect(first.assignments.reduce((sum: number, assignment: any) => sum + assignment.budget.time_minutes, 0)).toBe(first.budgets.time_minutes);
      expect(first.facets.every((facet: any) => facet.query_purposes.includes("disconfirm"))).toBe(true);
      expect(first.facets.every((facet: any) => facet.query_purposes.includes("freshness"))).toBe(true);
      expect(first.source_policy.snippets_are_evidence).toBe(false);
      expect(first.non_claims.join(" ")).toContain("does not activate an agent");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("refuses secrets, arbitrary fields, duplicate facets, and invalid budgets before work", async () => {
    const base = { question: "A public question", facets: ["One facet"], as_of: "2026-08-13" };
    await expect(runResearchPlan({ ...base, api_key: "not-accepted" })).rejects.toThrow("keys differ");
    await expect(runResearchPlan({ ...base, question: "token=supersecretvalue123456" })).rejects.toThrow("secret-shaped");
    await expect(runResearchPlan({ ...base, facets: ["same", "same"] })).rejects.toThrow("distinct");
    await expect(runResearchPlan({ ...base, budgets: { scouts: 5 } })).rejects.toThrow("integer from 1 to 4");
    await expect(runResearchPlan({ ...base, budgets: { max_queries: 1 } })).rejects.toThrow("must be at least 3");
    await expect(runResearchPlan({ ...base, as_of: "2026-02-31" })).rejects.toThrow("ISO 8601");
  });
});

describe("kingdom_research_check", () => {
  test("passes a complete content-addressed claim ledger while naming its proof limit", async () => {
    const fixture = await passingCase();
    const result = await runResearchCheck(fixture);
    expect(result).toMatchObject({
      schema: RESEARCH_CHECK_SCHEMA,
      contract_gate: "pass",
      counts: {
        required_facets: 1,
        answered_facets: 1,
        material_claims: 1,
        synthesis_claims: 1,
        sources: 1,
        independence_groups: 1,
        evidence_spans: 1,
        queries: 3,
      },
      failed_rules: [],
      gaps: [],
      stop_reason: "complete",
    });
    expect(result.report_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.does_not_establish.join(" ")).toContain("does not independently fetch sources or prove factual truth");
  });

  test("detects a changed evidence span, non-entailing citation, stale source, and unsupported synthesis", async () => {
    const { plan, report } = await passingCase();
    report.evidence[0]!.short_excerpt = "The span changed after its digest was recorded.";
    report.claims[0]!.citation_verdict = "partial";
    report.claims[0]!.freshness_verdict = "stale";
    report.sources[0]!.freshness = "stale";
    report.claims[0]!.status = "insufficient";
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toContain("evidence_excerpt_digest:evidence-1");
    expect(result.failed_rules).toContain("unsupported_synthesis_claim:claim-1");
    expect(result.failed_rules).toContain("complete_hides_gaps");
    expect(result.gaps).toContain("unresolved_claim:claim-1");
  });

  test("counts syndicated copies as one origin and requires two genuine independence groups", async () => {
    const { plan, report } = await passingCase();
    const excerpt = "A second article repeats the same originating statement.";
    report.sources.push({
      ...structuredClone(report.sources[0]!),
      id: "source-2",
      canonical_url: "https://example.com/syndicated-copy",
      directness: "secondary",
    });
    report.evidence.push({
      id: "evidence-2",
      source_id: "source-2",
      locator: "paragraph 3",
      short_excerpt: excerpt,
      excerpt_sha256: await digest(excerpt),
      stance: "supports",
      captured_at: "2026-08-13T10:03:30Z",
    });
    report.claims[0]!.evidence_standard = "two_independent_sources";
    report.claims[0]!.supporting_evidence.push("evidence-2");
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.counts.independence_groups).toBe(1);
    expect(result.failed_rules).toContain("independent_corroboration_missing:claim-1");
  });

  test("rejects duplicate URLs and identical bytes split into invented independence groups", async () => {
    const { plan, report } = await passingCase();
    report.sources.push({
      ...structuredClone(report.sources[0]!),
      id: "source-2",
      independence_group: "invented-second-origin",
    });
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toEqual(expect.arrayContaining([
      "duplicate_source_url:source-1:source-2",
      `duplicate_content_split_independence:${"a".repeat(12)}`,
    ]));
  });

  test("requires each answered facet to contribute a supported material synthesis claim", async () => {
    const { plan, report } = await passingCase();
    report.synthesis_claim_ids = [];
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toContain("facet_state_mismatch:facet-01");

    report.synthesis_claim_ids = ["claim-1"];
    report.claims[0]!.materiality = "background";
    const background = await runResearchCheck({ plan, report });
    expect(background.contract_gate).toBe("fail");
    expect(background.failed_rules).toContain("background_synthesis_claim:claim-1");
  });

  test("fails closed when web content causes an action, a private request, or unsafe automated retrieval", async () => {
    const { plan, report } = await passingCase();
    report.sources[0]!.rights.robots = "unavailable";
    report.safety.tool_actions_from_web_content = 1;
    report.safety.private_network_requests = 1;
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toEqual(expect.arrayContaining([
      "robots_not_allowed:source-1",
      "web_content_caused_tool_action",
      "private_network_request",
    ]));
  });

  test("binds reports to the exact compiled risk, facets, and budgets", async () => {
    const { plan, report } = await passingCase("high_stakes");
    const downgradedRisk = structuredClone(report);
    downgradedRisk.risk_tier = "ordinary";
    await expect(runResearchCheck({ plan, report: downgradedRisk })).rejects.toThrow("risk_tier does not match");

    const optionalFacet = structuredClone(report);
    optionalFacet.facets[0]!.required = false;
    await expect(runResearchCheck({ plan, report: optionalFacet })).rejects.toThrow("facets must exactly preserve");

    const alteredPlan = structuredClone(plan);
    alteredPlan.risk_tier = "ordinary";
    await expect(runResearchCheck({ plan: alteredPlan, report })).rejects.toThrow("exact deterministic output");
  });

  test("preserves opposing evidence as a conflict instead of synthesizing through it", async () => {
    const { plan, report } = await passingCase();
    const excerpt = "A directly relevant span contradicts the proposed claim.";
    report.evidence.push({
      id: "evidence-2",
      source_id: "source-1",
      locator: "section 2.3",
      short_excerpt: excerpt,
      excerpt_sha256: await digest(excerpt),
      stance: "refutes",
      captured_at: "2026-08-13T10:03:30Z",
    });
    report.claims[0]!.refuting_evidence = ["evidence-2"];
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toContain("opposing_evidence_unresolved:claim-1");
  });

  test("requires freshness exploration for current work", async () => {
    const { plan, report } = await passingCase("current");
    report.queries = report.queries.filter(({ purpose }) => purpose !== "freshness");
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toContain("planned_query_purpose_missing:facet-01:freshness");
  });

  test("enforces each scout's query, page, round, and elapsed-time ceilings", async () => {
    const seed = await passingCase();
    const questions = [
      "What does the canonical document establish?",
      "What independent canonical document establishes the second facet?",
    ];
    const plan = await runResearchPlan({
      question: "What do two canonical documents establish?",
      facets: questions,
      as_of: "2026-08-13",
      risk_tier: "ordinary",
      budgets: { scouts: 2, query_rounds: 3, max_queries: 8, max_pages: 4, time_minutes: 10 },
    });
    const report = structuredClone(seed.report);
    report.plan_id = plan.plan_id;
    report.facets = [
      { id: "facet-01", question: questions[0], required: true, status: "answered" },
      { id: "facet-02", question: questions[1], required: true, status: "answered" },
    ];
    report.assignment_receipts = [
      { scout_id: "scout-1", started_at: "2026-08-13T10:00:00Z", completed_at: "2026-08-13T10:04:00Z", stop_reason: "complete" },
      { scout_id: "scout-2", started_at: "2026-08-13T10:00:00Z", completed_at: "2026-08-13T10:04:00Z", stop_reason: "complete" },
    ];
    report.queries = [
      { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "first canonical source", purpose: "canonical", engine_or_index: "direct-url", executed_at: "2026-08-13T10:00:30Z", new_material_evidence: 1 },
      { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "first alternate terminology", purpose: "breadth", engine_or_index: "web-search", executed_at: "2026-08-13T10:01:00Z", new_material_evidence: 0 },
      { scout_id: "scout-1", facet_id: "facet-01", round: 1, query: "first counterexample", purpose: "disconfirm", engine_or_index: "web-search", executed_at: "2026-08-13T10:01:30Z", new_material_evidence: 0 },
      { scout_id: "scout-2", facet_id: "facet-02", round: 1, query: "second canonical source", purpose: "canonical", engine_or_index: "direct-url", executed_at: "2026-08-13T10:00:30Z", new_material_evidence: 1 },
      { scout_id: "scout-2", facet_id: "facet-02", round: 1, query: "second alternate terminology", purpose: "breadth", engine_or_index: "web-search", executed_at: "2026-08-13T10:01:00Z", new_material_evidence: 0 },
      { scout_id: "scout-2", facet_id: "facet-02", round: 1, query: "second counterexample", purpose: "disconfirm", engine_or_index: "web-search", executed_at: "2026-08-13T10:01:30Z", new_material_evidence: 0 },
    ];
    report.sources[0]!.retrieved_at = "2026-08-13T10:02:00Z";
    const source2 = {
      ...structuredClone(report.sources[0]!),
      id: "source-2",
      scout_id: "scout-2",
      canonical_url: "https://www.rfc-editor.org/rfc/rfc9110.html",
      independence_group: "rfc9110-origin",
      content_sha256: "b".repeat(64),
      version_id: "RFC 9110",
    };
    report.sources.push(source2);
    const excerpt2 = "The second canonical span directly supports the second fixture claim.";
    report.evidence.push({
      id: "evidence-2",
      source_id: "source-2",
      locator: "section 1",
      short_excerpt: excerpt2,
      excerpt_sha256: await digest(excerpt2),
      stance: "supports",
      captured_at: "2026-08-13T10:03:00Z",
    });
    report.claims.push({
      ...structuredClone(report.claims[0]!),
      id: "claim-2",
      atomic_text: "The second fixture claim is supported by its cited canonical span.",
      facet_id: "facet-02",
      supporting_evidence: ["evidence-2"],
    });
    report.synthesis_claim_ids.push("claim-2");
    report.review.reviewed_at = "2026-08-13T10:05:00Z";
    expect((await runResearchCheck({ plan, report })).contract_gate).toBe("pass");

    const queryOverrun = structuredClone(report);
    queryOverrun.queries.push(
      { scout_id: "scout-1", facet_id: "facet-01", round: 2, query: "first named gap followup", purpose: "gap", engine_or_index: "web-search", executed_at: "2026-08-13T10:02:00Z", new_material_evidence: 0 },
      { scout_id: "scout-1", facet_id: "facet-01", round: 2, query: "first bridge entity followup", purpose: "gap", engine_or_index: "web-search", executed_at: "2026-08-13T10:02:30Z", new_material_evidence: 0 },
    );
    const queryResult = await runResearchCheck({ plan, report: queryOverrun });
    expect(queryResult.failed_rules).toContain("scout_query_budget_exceeded:scout-1");
    expect(queryResult.failed_rules).not.toContain("query_budget_exceeded");

    const pageOverrun = structuredClone(report);
    pageOverrun.sources.push(
      { ...structuredClone(report.sources[0]!), id: "source-3", canonical_url: "https://example.com/third", content_sha256: "c".repeat(64), independence_group: "third-origin" },
      { ...structuredClone(report.sources[0]!), id: "source-4", canonical_url: "https://example.org/fourth", content_sha256: "d".repeat(64), independence_group: "fourth-origin" },
    );
    const pageResult = await runResearchCheck({ plan, report: pageOverrun });
    expect(pageResult.failed_rules).toContain("scout_page_budget_exceeded:scout-1");
    expect(pageResult.failed_rules).not.toContain("page_budget_exceeded");

    const timeOverrun = structuredClone(report);
    timeOverrun.assignment_receipts[0]!.completed_at = "2026-08-13T10:06:00Z";
    timeOverrun.review.reviewed_at = "2026-08-13T10:07:00Z";
    const timeResult = await runResearchCheck({ plan, report: timeOverrun });
    expect(timeResult.failed_rules).toContain("scout_time_budget_exceeded:scout-1");

    const crossedAssignment = structuredClone(report);
    crossedAssignment.sources[1]!.scout_id = "scout-1";
    await expect(runResearchCheck({ plan, report: crossedAssignment })).rejects.toThrow("outside its scout's assigned facets");
  });

  test("requires a conflict receipt even when the conflicted claim is background", async () => {
    const { plan, report } = await passingCase();
    const excerpt = "This span refutes the non-material background statement.";
    report.evidence.push({
      id: "evidence-2",
      source_id: "source-1",
      locator: "section 3",
      short_excerpt: excerpt,
      excerpt_sha256: await digest(excerpt),
      stance: "refutes",
      captured_at: "2026-08-13T10:03:15Z",
    });
    report.claims.push({
      ...structuredClone(report.claims[0]!),
      id: "claim-background",
      atomic_text: "A non-material background statement remains disputed.",
      materiality: "background",
      status: "conflicted",
      supporting_evidence: ["evidence-1"],
      refuting_evidence: ["evidence-2"],
      citation_verdict: "partial",
      uncertainty_basis: ["The captured spans directly disagree."],
    });
    const missing = await runResearchCheck({ plan, report });
    expect(missing.failed_rules).toContain("conflict_without_receipt:claim-background");

    report.conflicts.push({
      claim_ids: ["claim-background"],
      causes_checked: ["version", "definition", "shared upstream data"],
      resolution: "No material synthesis depends on the disputed background statement.",
      residual_uncertainty: "The two captured spans remain in direct disagreement.",
    });
    expect((await runResearchCheck({ plan, report })).contract_gate).toBe("pass");
  });

  test("requires declared domain-qualified independent human review for high-stakes work", async () => {
    const { plan, report } = await passingCase("high_stakes");
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("fail");
    expect(result.failed_rules).toContain("high_stakes_human_review_missing");
    expect(result.failed_rules).toContain("high_stakes_domain_qualification_missing");

    report.review.method = "human";
    const unqualified = await runResearchCheck({ plan, report });
    expect(unqualified.contract_gate).toBe("fail");
    expect(unqualified.failed_rules).toContain("high_stakes_domain_qualification_missing");

    report.review.domain = "Internet protocol standards";
    report.review.qualification_basis = "Experience reviewing IETF standards and their errata.";
    const qualified = await runResearchCheck({ plan, report });
    expect(qualified.contract_gate).toBe("pass");
  });

  test("returns an honest bounded result when access leaves a required facet open", async () => {
    const { plan, report } = await passingCase();
    report.facets[0]!.status = "gap";
    report.sources = [];
    report.evidence = [];
    report.claims = [];
    report.synthesis_claim_ids = [];
    report.queries = [];
    report.stop_reason = "access";
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("bounded_with_gaps");
    expect(result.failed_rules).toEqual([]);
    expect(result.gaps).toEqual(["facet_gap:facet-01"]);
  });

  test("accepts saturation only when each open facet has two distinct no-progress rounds", async () => {
    const { plan, report } = await passingCase();
    report.facets[0]!.status = "gap";
    report.sources = [];
    report.evidence = [];
    report.claims = [];
    report.synthesis_claim_ids = [];
    report.stop_reason = "saturated";
    report.assignment_receipts[0]!.completed_at = "2026-08-13T10:06:30Z";
    report.assignment_receipts[0]!.stop_reason = "saturated";
    report.review.reviewed_at = "2026-08-13T10:07:00Z";
    report.queries = [
      { scout_id: "scout-1", facet_id: "facet-01", round: 2, query: "second distinct gap query", purpose: "gap", engine_or_index: "web-search", executed_at: "2026-08-13T10:05:00Z", new_material_evidence: 0 },
      { scout_id: "scout-1", facet_id: "facet-01", round: 3, query: "third distinct gap query", purpose: "gap", engine_or_index: "web-search", executed_at: "2026-08-13T10:06:00Z", new_material_evidence: 0 },
    ];
    const result = await runResearchCheck({ plan, report });
    expect(result.contract_gate).toBe("bounded_with_gaps");
    expect(result.failed_rules).not.toContain("saturation_not_demonstrated:facet-01");

    report.queries[1]!.new_material_evidence = 1;
    const invalid = await runResearchCheck({ plan, report });
    expect(invalid.contract_gate).toBe("fail");
    expect(invalid.failed_rules).toContain("saturation_not_demonstrated:facet-01");

    report.queries[1]!.new_material_evidence = 0;
    report.queries[1]!.query = `${report.queries[0]!.query}!`;
    const duplicate = await runResearchCheck({ plan, report });
    expect(duplicate.contract_gate).toBe("fail");
    expect(duplicate.failed_rules).toContain("saturation_not_demonstrated:facet-01");
  });

  test("rejects literal loopback and special-use source addresses", async () => {
    const urls = [
      "https://[::]/",
      "https://[::ffff:127.0.0.1]/",
      "https://100.64.0.1/",
      "https://192.0.0.1/",
      "https://192.88.99.1/",
      "https://198.18.0.1/",
      "https://localhost./",
      "https://foo.localhost./",
      "https://local/",
      "https://local./",
      "https://router.local./",
      "https://[2002:7f00:1::]/",
      "https://[2001:11::1]/",
      "https://[3ffe::1]/",
    ];
    for (const canonicalUrl of urls) {
      const { plan, report } = await passingCase();
      report.sources[0]!.canonical_url = canonicalUrl;
      await expect(runResearchCheck({ plan, report })).rejects.toThrow("public credential-free HTTPS URL");
    }
    const publicIpv6 = await passingCase();
    publicIpv6.report.sources[0]!.canonical_url = "https://[2606:4700:4700::1111]/";
    expect((await runResearchCheck(publicIpv6)).contract_gate).toBe("pass");
  });
});
